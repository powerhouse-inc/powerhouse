import { createRequire } from "node:module";
import { ApolloGateway, LocalCompose } from "@apollo/gateway";
import type { IReactorClient, ISyncManager } from "@powerhousedao/reactor";
import type {
  DocumentModelGlobalState,
  DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import type * as GraphQL from "graphql";
import type { GraphQLError, GraphQLSchema } from "graphql";
import { beforeEach, describe, expect, it } from "vitest";
import type { BaseSubgraph } from "../src/graphql/base-subgraph.js";
import { DocumentModelSubgraph } from "../src/graphql/document-model-subgraph.js";
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
const { graphql, isInputObjectType, isObjectType } = createRequire(
  import.meta.url,
)("graphql") as typeof GraphQL;

type Call = { method: string; args: unknown[] };

const VALUE = "ref-value";
const DOCUMENT_TYPE = "powerhouse/ledger";
const NAMESPACE = "Ledger";

const LEDGER = {
  id: DOCUMENT_TYPE,
  name: NAMESPACE,
  specifications: [
    {
      version: 1,
      state: {
        global: {
          schema: `type LedgerState { entries: [String!]! }`,
          initialValue: "",
        },
        local: { schema: "", initialValue: "" },
      },
      modules: [
        {
          id: "entries",
          name: "entries",
          description: "",
          operations: [
            {
              id: "add-entry",
              name: "ADD_ENTRY",
              schema: `input AddEntryInput { entry: String! }`,
              description: "",
              template: "",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
          ],
        },
      ],
    },
  ],
} as unknown as DocumentModelGlobalState;

const MODULE = {
  documentModel: { global: LEDGER },
  actions: { addEntry: (input: unknown) => ({ type: "ADD_ENTRY", input }) },
} as unknown as DocumentModelModule;

type Pair = {
  field: string;
  kind: "query" | "mutation";
  current: string;
  deprecated: string;
  optional?: boolean;
  /** The field selection, given the pair's argument text. */
  source: (args: string) => string;
};

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
      ["documentOutgoingRelationships", "source"],
      ["documentIncomingRelationships", "target"],
    ] as const
  ).map(([field, end]): Pair => ({
    field,
    kind: "query",
    current: `${end}IdOrSlug`,
    deprecated: `${end}Identifier`,
    source: (a) => `${field}(${a} relationshipType: "child") { cursor }`,
  })),
  {
    field: "createDocument",
    kind: "mutation",
    current: "parentIdOrSlug",
    deprecated: "parentIdentifier",
    optional: true,
    source: (a) => `createDocument(name: "n" ${a}) { id }`,
  },
  {
    field: "createEmptyDocument",
    kind: "mutation",
    current: "parentIdOrSlug",
    deprecated: "parentIdentifier",
    optional: true,
    source: (a) => `createEmptyDocument(${a}) { id }`,
  },
  {
    field: "addEntry",
    kind: "mutation",
    current: "documentIdOrSlug",
    deprecated: "docId",
    source: (a) => `addEntry(${a} input: { entry: "e" }) { id }`,
  },
  {
    field: "addEntryAsync",
    kind: "mutation",
    current: "documentIdOrSlug",
    deprecated: "docId",
    source: (a) => `addEntryAsync(${a} input: { entry: "e" })`,
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

function buildSubgraph(calls: Call[]): BaseSubgraph {
  return new DocumentModelSubgraph(MODULE, {
    reactorClient: recorder<IReactorClient>(calls),
    syncManager: recorder<ISyncManager>(calls),
    authorizationService: createAuthorizationService({
      admins: [],
      defaultProtection: false,
      policy: AuthorizationPolicy.OPEN,
    }),
    graphqlManager: {},
  } as unknown as SubgraphArgs);
}

const ctx = { headers: {}, db: null } as unknown as Context;

function aliasErrors(errors: readonly GraphQLError[] | undefined) {
  return (errors ?? []).filter(
    (error) => error.extensions.code === "BAD_USER_INPUT",
  );
}

describe("document model subgraph argument names", () => {
  let calls: Call[];
  let schema: GraphQLSchema;

  beforeEach(() => {
    calls = [];
    const subgraph = buildSubgraph(calls);
    schema = createSchema([MODULE], subgraph.resolvers, subgraph.typeDefs);
  });

  function run(pair: Pair, args: string) {
    const selection = pair.source(args).replace(/\(\s*\)/, "");
    return graphql({
      schema,
      source: `${pair.kind} { ${NAMESPACE} { ${selection} } }`,
      contextValue: ctx,
    });
  }

  describe.each(PAIRS)("$field($current | $deprecated)", (pair) => {
    const literal = JSON.stringify(VALUE);

    it.each([pair.deprecated, pair.current])("accepts %s", async (name) => {
      const result = await run(pair, `${name}: ${literal}`);

      expect(result.data).toBeDefined();
      expect(aliasErrors(result.errors)).toEqual([]);
      expect(calls.flatMap((call) => call.args)).toContainEqual(VALUE);
    });

    it("refuses both with BAD_USER_INPUT", async () => {
      const result = await run(
        pair,
        `${pair.current}: ${literal} ${pair.deprecated}: ${literal}`,
      );

      expect(aliasErrors(result.errors)).toMatchObject([
        {
          message: `Pass ${pair.current} or ${pair.deprecated}, not both.`,
          path: [NAMESPACE, pair.field],
        },
      ]);
      expect(calls).toEqual([]);
    });

    if (pair.optional) {
      it("creates with no parent when neither is given", async () => {
        const result = await run(pair, "");

        expect(aliasErrors(result.errors)).toEqual([]);
        expect(calls).toEqual([
          { method: "createEmpty", args: [DOCUMENT_TYPE, {}] },
        ]);
      });
    } else {
      it("refuses neither with BAD_USER_INPUT", async () => {
        const result = await run(pair, "");

        expect(aliasErrors(result.errors)).toMatchObject([
          {
            message: `${pair.current} is required.`,
            path: [NAMESPACE, pair.field],
          },
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
            name: "ledger",
            typeDefs: buildSubgraphSchemaModule(
              [MODULE],
              subgraph.resolvers,
              subgraph.typeDefs,
            ).typeDefs,
            url: "http://localhost/ledger",
          },
        ],
      }),
    });

    try {
      const { schema: api } = await gateway.load();

      for (const pair of PAIRS) {
        const typeName = `${NAMESPACE}${pair.kind === "query" ? "Queries" : "Mutations"}`;
        const type = api.getType(typeName);
        if (!isObjectType(type)) throw new Error(typeName);
        const field = Object.values(type.getFields()).find(
          ({ name }) => name === pair.field,
        );
        if (!field) throw new Error(pair.field);
        const reasons = Object.fromEntries(
          field.args.map((arg) => [arg.name, arg.deprecationReason ?? null]),
        );
        expect(reasons, pair.field).toMatchObject({
          [pair.current]: null,
          [pair.deprecated]: `Use ${pair.current}.`,
        });
      }

      const search = api.getType(`${NAMESPACE}_SearchFilterInput`);
      if (!isInputObjectType(search)) throw new Error("SearchFilterInput");
      expect(search.getFields()).toMatchObject({
        identifiers: { deprecationReason: "Ignored. Filter by parentId." },
      });
    } finally {
      await gateway.stop();
    }
  });
});
