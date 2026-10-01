import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ApolloGateway, LocalCompose } from "@apollo/gateway";
import type { IReactorClient, ISyncManager } from "@powerhousedao/reactor";
import type * as GraphQL from "graphql";
import {
  Kind,
  OperationTypeNode,
  type GraphQLError,
  type GraphQLInputType,
  type GraphQLSchema,
  type OperationDefinitionNode,
} from "graphql";
import { beforeEach, describe, expect, it } from "vitest";
import { ArgumentAliasError } from "../src/graphql/argument-aliases.js";
import { ReactorSubgraph } from "../src/graphql/reactor/subgraph.js";
import type { Context, SubgraphArgs } from "../src/graphql/types.js";
import {
  AuthorizationPolicy,
  createAuthorizationService,
} from "../src/services/authorization.service.js";
import {
  buildSubgraphSchemaModule,
  createSchema,
} from "../src/utils/create-schema.js";

// The CommonJS build @apollo/subgraph uses; vite would hand this file the ESM one.
const {
  execute,
  getNamedType,
  graphql,
  isEnumType,
  isInputObjectType,
  isListType,
  isNonNullType,
  isScalarType,
  parse,
  typeFromAST,
  validate,
} = createRequire(import.meta.url)("graphql") as typeof GraphQL;

type Call = { method: string; args: unknown[] };

const VALUE = "ref-value";

type Pair = {
  field: string;
  kind: "query" | "mutation";
  current: string;
  deprecated: string;
  /** The input object the pair lives on, when it is not a field argument. */
  input?: string;
  list?: boolean;
  optional?: boolean;
  /** The field selection, given the pair's argument text. */
  source: (args: string) => string;
};

const RELATIONSHIP_WRITES = [
  "addRelationship",
  "updateRelationship",
  "removeRelationship",
] as const;

const PAIRS: Pair[] = [
  {
    field: "document",
    kind: "query",
    current: "idOrSlug",
    deprecated: "identifier",
    source: (a) => `document(${a}) { childIds }`,
  },
  ...(
    [
      ["documentOutgoingRelationships", "source", "{ cursor }"],
      ["documentIncomingRelationships", "target", "{ cursor }"],
      ["documentOutgoingRelationshipEdges", "source", "{ cursor }"],
      ["documentIncomingRelationshipEdges", "target", "{ cursor }"],
    ] as const
  ).map(([field, end, selection]): Pair => ({
    field,
    kind: "query",
    current: `${end}IdOrSlug`,
    deprecated: `${end}Identifier`,
    source: (a) => `${field}(${a} relationshipType: "child") ${selection}`,
  })),
  {
    field: "documentOperations",
    kind: "query",
    current: "documentIdOrSlug",
    deprecated: "documentId",
    input: "OperationsFilterInput",
    source: (a) => `documentOperations(filter: { ${a} }) { cursor }`,
  },
  {
    field: "evaluateActions",
    kind: "query",
    current: "documentIdOrSlug",
    deprecated: "documentIdentifier",
    source: (a) => `evaluateActions(${a} candidates: []) { allAllowed }`,
  },
  {
    field: "createDocument",
    kind: "mutation",
    current: "parentIdOrSlug",
    deprecated: "parentIdentifier",
    optional: true,
    source: (a) => `createDocument(document: { header: {} } ${a}) { id }`,
  },
  {
    field: "createEmptyDocument",
    kind: "mutation",
    current: "parentIdOrSlug",
    deprecated: "parentIdentifier",
    optional: true,
    source: (a) => `createEmptyDocument(documentType: "t" ${a}) { id }`,
  },
  ...(
    [
      ["execute", `actions: []`],
      ["executeAsync", `actions: []`],
      ["renameDocument", `name: "n"`],
      ["setPreferredEditor", ``],
    ] as const
  ).map(([field, rest]): Pair => ({
    field,
    kind: "mutation",
    current: "documentIdOrSlug",
    deprecated: "documentIdentifier",
    source: (a) => `${field}(${a} ${rest}) { id }`,
  })),
  ...RELATIONSHIP_WRITES.flatMap((field): Pair[] => [
    {
      field,
      kind: "mutation",
      current: "sourceIdOrSlug",
      deprecated: "sourceIdentifier",
      source: (a) =>
        `${field}(${a} targetIdOrSlug: "t" relationshipType: "r") { id }`,
    },
    {
      field,
      kind: "mutation",
      current: "targetIdOrSlug",
      deprecated: "targetIdentifier",
      source: (a) =>
        `${field}(sourceIdOrSlug: "s" ${a} relationshipType: "r") { id }`,
    },
  ]),
  ...(
    [
      ["sourceParent", `targetParentIdOrSlug: "p" targetIdOrSlug: "t"`],
      ["targetParent", `sourceParentIdOrSlug: "p" targetIdOrSlug: "t"`],
      ["target", `sourceParentIdOrSlug: "p" targetParentIdOrSlug: "q"`],
    ] as const
  ).map(([prefix, rest]): Pair => ({
    field: "moveRelationship",
    kind: "mutation",
    current: `${prefix}IdOrSlug`,
    deprecated: `${prefix}Identifier`,
    source: (a) =>
      `moveRelationship(${a} ${rest} relationshipType: "r") { source { id } }`,
  })),
  {
    field: "deleteDocument",
    kind: "mutation",
    current: "idOrSlug",
    deprecated: "identifier",
    source: (a) => `deleteDocument(${a})`,
  },
  {
    field: "deleteDocuments",
    kind: "mutation",
    current: "idsOrSlugs",
    deprecated: "identifiers",
    list: true,
    source: (a) => `deleteDocuments(${a})`,
  },
];

/** Every method records its call and throws, so a call shows what reached it. */
function recorder<T extends object>(calls: Call[]): T {
  return new Proxy({} as T, {
    get: (_target, prop) => {
      if (typeof prop !== "string" || prop === "then") return undefined;
      return (...args: unknown[]) => {
        calls.push({ method: prop, args });
        throw new Error(`stub: ${prop}`);
      };
    },
  });
}

function buildSubgraph(calls: Call[]): ReactorSubgraph {
  return new ReactorSubgraph({
    reactorClient: recorder<IReactorClient>(calls),
    syncManager: recorder<ISyncManager>(calls),
    authorizationService: createAuthorizationService({
      admins: [],
      defaultProtection: false,
      policy: AuthorizationPolicy.OPEN,
    }),
    graphqlManager: {
      driveOwnershipCache: { add: () => undefined, remove: () => undefined },
    },
  } as unknown as SubgraphArgs);
}

function buildSchema(subgraph: ReactorSubgraph): GraphQLSchema {
  return createSchema([], subgraph.resolvers, subgraph.typeDefs);
}

const ctx = { headers: {}, db: null } as unknown as Context;

function aliasErrors(errors: readonly GraphQLError[] | undefined) {
  return (errors ?? []).filter(
    (error) => error.extensions.code === "BAD_USER_INPUT",
  );
}

describe("reactor subgraph argument names", () => {
  let calls: Call[];
  let schema: GraphQLSchema;

  beforeEach(() => {
    calls = [];
    schema = buildSchema(buildSubgraph(calls));
  });

  function run(pair: Pair, args: string) {
    return graphql({
      schema,
      source: `${pair.kind} { ${pair.source(args).replace(/\(\s*\)/, "")} }`,
      contextValue: ctx,
    });
  }

  describe.each(PAIRS)("$field($current | $deprecated)", (pair) => {
    const value = pair.list ? [VALUE] : VALUE;
    const literal = JSON.stringify(value);

    it.each([pair.deprecated, pair.current])("accepts %s", async (name) => {
      const result = await run(pair, `${name}: ${literal}`);

      expect(result.data).toBeDefined();
      expect(aliasErrors(result.errors)).toEqual([]);
      expect(calls.flatMap((call) => call.args)).toContainEqual(value);
    });

    it("refuses both with BAD_USER_INPUT", async () => {
      const result = await run(
        pair,
        `${pair.current}: ${literal} ${pair.deprecated}: ${literal}`,
      );

      expect(aliasErrors(result.errors)).toMatchObject([
        {
          message: `Pass ${pair.current} or ${pair.deprecated}, not both.`,
          path: [pair.field],
        },
      ]);
      expect(calls).toEqual([]);
    });

    if (pair.optional) {
      it("creates with no parent when neither is given", async () => {
        const result = await run(pair, "");

        expect(aliasErrors(result.errors)).toEqual([]);
        expect(calls).toEqual(
          pair.field === "createDocument"
            ? [{ method: "create", args: [{ header: {} }] }]
            : [{ method: "createEmpty", args: ["t", {}] }],
        );
      });
    } else {
      it("refuses neither with BAD_USER_INPUT", async () => {
        const result = await run(pair, "");

        expect(aliasErrors(result.errors)).toMatchObject([
          { message: `${pair.current} is required.`, path: [pair.field] },
        ]);
        expect(calls).toEqual([]);
      });
    }
  });

  it("keeps deprecations in the composed API schema", async () => {
    const subgraph = buildSubgraph([]);
    const gateway = new ApolloGateway({
      supergraphSdl: new LocalCompose({
        localServiceList: [
          {
            name: "r",
            typeDefs: buildSubgraphSchemaModule(
              [],
              subgraph.resolvers,
              subgraph.typeDefs,
            ).typeDefs,
            url: "http://localhost/r",
          },
        ],
      }),
    });

    try {
      const { schema: api } = await gateway.load();

      const argumentsOf = (pair: Pair) => {
        if (pair.input) {
          const input = api.getType(pair.input);
          if (!isInputObjectType(input)) throw new Error(pair.input);
          return Object.values(input.getFields());
        }
        const root =
          pair.kind === "query" ? api.getQueryType() : api.getMutationType();
        const field = root?.getFields()[pair.field];
        if (!field) throw new Error(pair.field);
        return field.args;
      };

      for (const pair of PAIRS) {
        const args = argumentsOf(pair);
        const reasons = Object.fromEntries(
          args.map((arg) => [arg.name, arg.deprecationReason ?? null]),
        );
        expect(reasons, pair.field).toMatchObject({
          [pair.current]: null,
          [pair.deprecated]: `Use ${pair.current}.`,
        });
      }

      const search = api.getType("SearchFilterInput");
      if (!isInputObjectType(search)) throw new Error("SearchFilterInput");
      expect(search.getFields()).toMatchObject({
        identifiers: {
          deprecationReason: "Ignored. Filter by type or parentId.",
        },
      });
    } finally {
      await gateway.stop();
    }
  });

  it("rejects nothing an older client sends", async () => {
    const fixture = parse(
      readFileSync(
        join(
          dirname(fileURLToPath(import.meta.url)),
          "fixtures/operations.pre-rename.graphql",
        ),
        "utf8",
      ),
    );
    expect(validate(schema, fixture)).toEqual([]);

    const fragments = fixture.definitions.filter(
      (definition) => definition.kind === Kind.FRAGMENT_DEFINITION,
    );
    const operations = fixture.definitions.filter(
      (definition): definition is OperationDefinitionNode =>
        definition.kind === Kind.OPERATION_DEFINITION &&
        definition.operation !== OperationTypeNode.SUBSCRIPTION,
    );
    expect(operations.length).toBeGreaterThan(20);

    for (const operation of operations) {
      const variableValues = Object.fromEntries(
        (operation.variableDefinitions ?? []).map((definition) => [
          definition.variable.name.value,
          sampleValue(typeFromAST(schema, definition.type) as GraphQLInputType),
        ]),
      );

      const result = await execute({
        schema,
        document: {
          kind: Kind.DOCUMENT,
          definitions: [operation, ...fragments],
        },
        variableValues,
        contextValue: ctx,
      });

      const name = operation.name?.value;
      expect(result.data, name).toBeDefined();
      expect(aliasErrors(result.errors), name).toEqual([]);
      expect(
        (result.errors ?? []).filter(
          (error) =>
            error.path === undefined ||
            error.originalError instanceof ArgumentAliasError,
        ),
        name,
      ).toEqual([]);
    }
  });
});

/** Required fields plus deprecated ones: what was required before the rename. */
function sampleValue(type: GraphQLInputType): unknown {
  if (isNonNullType(type)) return sampleValue(type.ofType);
  if (isListType(type)) return [sampleValue(type.ofType)];
  if (isEnumType(type)) return type.getValues()[0]?.value;
  if (isInputObjectType(type)) {
    return Object.fromEntries(
      Object.values(type.getFields())
        .filter(
          (field) =>
            (isNonNullType(field.type) && field.defaultValue === undefined) ||
            field.deprecationReason !== undefined,
        )
        .map((field) => [field.name, sampleValue(field.type)]),
    );
  }
  if (isScalarType(type)) {
    switch (getNamedType(type).name) {
      case "Int":
      case "Float":
        return 1;
      case "Boolean":
        return true;
      case "JSONObject":
        return {};
      case "DateTime":
        return "2026-01-01T00:00:00.000Z";
      default:
        return VALUE;
    }
  }
  throw new Error(`No sample for ${String(type)}`);
}
