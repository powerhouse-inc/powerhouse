import type {
  IReactorReadClient,
  IReactorWriteClient,
  ISyncManager,
} from "@powerhousedao/reactor";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import type {
  GraphQLField,
  GraphQLNamedType,
  GraphQLInputType,
  GraphQLObjectType,
  GraphQLResolveInfo,
  GraphQLSchema,
} from "graphql";
import { createRequire } from "node:module";
import type * as GraphQL from "graphql";
import { beforeAll, describe, expect, it } from "vitest";
import { AnalyticsSubgraph } from "../../src/graphql/analytics-subgraph.js";
import { AuthSubgraph } from "../../src/graphql/auth/subgraph.js";
import { DocumentModelSubgraph } from "../../src/graphql/document-model-subgraph.js";
import {
  filterBuildableSubgraphs,
  mergeSubgraphSchemas,
} from "../../src/graphql/gateway/adapter-gateway-stitching.js";
import type { SubgraphDefinition } from "../../src/graphql/gateway/types.js";
import { WRITE_SIDE_QUERIES } from "../../src/graphql/reactor/resolvers.js";
import { ReactorSubgraph } from "../../src/graphql/reactor/subgraph.js";
import { RequestClientBinder } from "../../src/graphql/request-clients.js";
import { SystemSubgraph } from "../../src/graphql/system/subgraph.js";
import type {
  Context,
  ISubgraph,
  SubgraphArgs,
} from "../../src/graphql/types.js";
import {
  AuthorizationPolicy,
  createAuthorizationService,
} from "../../src/services/authorization.service.js";
import {
  buildSubgraphSchemaModule,
  getGeneratedDocumentModelTypes,
} from "../../src/utils/create-schema.js";
import { settledHandle, settledJob } from "../utils/client-halves.js";

// The CommonJS build the merged schema is made with.
const {
  getNamedType,
  isEnumType,
  isInputObjectType,
  isListType,
  isNonNullType,
  isObjectType,
  isScalarType,
} = createRequire(import.meta.url)("graphql") as typeof GraphQL;

/**
 * Mutations that write no document: they reach the sync manager's channel
 * mailboxes, never the reactor's queue, so they never touch
 * `ctx.clients.write`. (The auth subgraph's grants write the host's permission
 * tables, but resolve their document on the write half, so they touch it.)
 */
const MUTATIONS_WITHOUT_WRITE_CLIENT = [
  "Mutation.touchChannel",
  "Mutation.pushSyncEnvelopes",
];

/** `Query.<field>` coordinates bound to the write half. */
const WRITE_HALF_QUERIES = Object.entries(WRITE_SIDE_QUERIES)
  .filter(([, binding]) => binding === "write")
  .map(([field]) => `Query.${field}`);

const MODEL =
  documentModelDocumentModelModule as unknown as DocumentModelModule;
const MODEL_TYPE = MODEL.documentModel.global.id;

const stubDocument = {
  header: {
    id: "doc-1",
    name: "stub",
    documentType: MODEL_TYPE,
    slug: "doc-1",
    branch: "main",
    revision: { global: 1 },
    createdAtUtcIso: "2026-01-01T00:00:00.000Z",
    lastModifiedAtUtcIso: "2026-01-01T00:00:00.000Z",
    meta: {},
    protocolVersions: {},
    sig: { publicKey: {}, nonce: "" },
  },
  state: { global: {}, local: {} },
  operations: { global: [], local: [] },
  initialState: { global: {}, local: {} },
  clipboard: [],
};
const emptyPage = { results: [], options: { cursor: "", limit: 10 } };

/** What each read answers, so a resolver gets past it to what it does next. */
const READS: Record<string, (...args: unknown[]) => unknown> = {
  get: () => Promise.resolve(stubDocument),
  getMany: () => Promise.resolve([stubDocument]),
  find: () => Promise.resolve({ ...emptyPage, results: [stubDocument] }),
  resolveIdOrSlug: () => Promise.resolve("doc-1"),
  isServed: () => Promise.resolve(true),
  getOperations: () => Promise.resolve(emptyPage),
  getOutgoingRelationships: () => Promise.resolve(emptyPage),
  getIncomingRelationships: () => Promise.resolve(emptyPage),
  getOutgoingRelationshipEdges: () => Promise.resolve(emptyPage),
  getIncomingRelationshipEdges: () => Promise.resolve(emptyPage),
  getJobStatus: () => Promise.resolve(settledJob("doc-1")),
  waitForJob: () => Promise.resolve(settledJob("doc-1")),
  getDocumentModelModules: () => Promise.resolve({ ...emptyPage }),
  getDocumentModelModule: () => Promise.resolve(MODEL),
  getDocumentModelModuleForDocument: () => Promise.resolve(MODEL),
  getCreateSignaturePolicy: () => Promise.resolve("legacy"),
  getCreateProtocolVersions: () => Promise.resolve({}),
  newDocument: () => Promise.resolve(structuredClone(stubDocument)),
  subscribe: () => () => undefined,
};

const handle = () => Promise.resolve(settledHandle("doc-1"));

/** What each write answers: a settled handle, or the shape a batch has. */
const WRITES: Record<string, (...args: unknown[]) => unknown> = {
  describe: () =>
    Promise.resolve({
      documentId: "doc-1",
      documentType: MODEL_TYPE,
      slug: "doc-1",
      branch: "main",
      revision: { global: 1 },
    }),
  evaluateActions: () =>
    Promise.resolve({
      evaluations: [],
      allAllowed: true,
      anyAllowed: true,
      allDenied: false,
      anyDenied: false,
    }),
  isDocumentIdTaken: () => Promise.resolve(false),
  executeBatch: () =>
    Promise.resolve({
      jobs: {},
      handles: {},
      written: Promise.resolve({}),
      readable: Promise.resolve({}),
    }),
  moveRelationship: () =>
    Promise.resolve({
      removed: settledHandle("doc-1"),
      added: settledHandle("doc-2"),
    }),
  deleteDocuments: () => Promise.resolve([settledHandle("doc-1")]),
};

/** A client half that records every member a resolver reaches for. */
function recording<T extends object>(
  side: "read" | "write",
  answers: Record<string, (...args: unknown[]) => unknown>,
  touched: string[],
): T {
  const fallback = side === "write" ? handle : () => Promise.resolve(undefined);
  return new Proxy({} as T, {
    get: (_target, property) => {
      if (typeof property !== "string" || property === "then") {
        return undefined;
      }
      touched.push(`${side}.${property}`);
      if (property === "drives") {
        return recording(side, {}, touched);
      }
      return answers[property] ?? fallback;
    },
  });
}

/** A collaborator whose every member answers an empty, resolved value. */
function inert<T extends object>(): T {
  return new Proxy({} as T, {
    get: (_target, property) =>
      property === "then" || typeof property === "symbol"
        ? undefined
        : () => Promise.resolve([]),
  });
}

/** A value of `type` that passes input coercion. */
function stubValue(type: GraphQLInputType, name: string): unknown {
  if (isNonNullType(type)) return stubValue(type.ofType, name);
  if (isListType(type)) return [stubValue(type.ofType, name)];
  if (OVERRIDES[name] !== undefined) return OVERRIDES[name];
  if (isEnumType(type)) return type.getValues()[0].value;
  if (isInputObjectType(type)) {
    return Object.fromEntries(
      Object.values(type.getFields())
        .filter((field) => field.deprecationReason == null)
        .map((field) => [field.name, stubValue(field.type, field.name)]),
    );
  }
  if (isScalarType(type)) {
    switch (type.name) {
      case "Int":
      case "Float":
        return 1;
      case "Boolean":
        return false;
      case "JSONObject":
      case "Unknown":
        return {};
      default:
        return "doc-1";
    }
  }
  return null;
}

/** Arguments whose generic stub would be refused before the client is reached. */
const OVERRIDES: Record<string, unknown> = {
  document: { header: { ...stubDocument.header, slug: "" } },
  // One action, in the shape both the typed and the untyped fields accept.
  actions: {
    id: "action-1",
    type: "SET_NAME",
    scope: "global",
    timestampUtcMs: "2026-01-01T00:00:00.000Z",
    input: { name: "stub" },
  },
  slug: "",
  timestampUtcMs: "2026-01-01T00:00:00.000Z",
  type: "SET_NAME",
  scope: "global",
  dependsOn: [],
  version: 1,
};

type Touches = { touched: string[]; error: unknown };

/** One subgraph's resolvers as the manager binds them. */
function definitionOf(
  subgraph: ISubgraph,
  binder: RequestClientBinder,
  core: boolean,
): SubgraphDefinition {
  const module = buildSubgraphSchemaModule(
    [MODEL],
    binder.bindResolvers(
      subgraph.resolvers,
      core && subgraph.writeSideQueries
        ? new Set(subgraph.writeSideQueries)
        : undefined,
    ),
    subgraph.typeDefs,
    {
      generated: getGeneratedDocumentModelTypes([MODEL]),
      ownTypeNames:
        subgraph instanceof DocumentModelSubgraph
          ? subgraph.generatedTypeNames
          : undefined,
    },
  );
  return {
    name: subgraph.name,
    typeDefs: module.typeDefs,
    resolvers: module.resolvers,
    url: `http://localhost/${subgraph.name}`,
  };
}

describe("the stitched schema binds queries to the read half and mutations to the write half", () => {
  const touched: string[] = [];
  let schema: GraphQLSchema;

  beforeAll(() => {
    const read = recording<IReactorReadClient>("read", READS, touched);
    const write = recording<IReactorWriteClient>("write", WRITES, touched);
    const binder = new RequestClientBinder(read, write);
    const args = {
      readClient: read,
      relationalDb: inert(),
      analyticsStore: inert(),
      syncManager: inert<ISyncManager>(),
      documentPermissionService: inert(),
      authorizationService: createAuthorizationService({
        admins: [],
        defaultProtection: false,
        policy: AuthorizationPolicy.OPEN,
      }),
      graphqlManager: {
        driveOwnershipCache: {
          add: () => undefined,
          remove: () => undefined,
          has: () => true,
        },
        setAdditionalContextFields: () => undefined,
        getAdditionalContextFields: () => ({}),
        // The node queries read the drive's gate on the read half.
        driveNodes: {
          getNode: () =>
            Promise.resolve({
              kind: "folder",
              id: "doc-1",
              driveId: "doc-1",
              parentFolder: null,
              name: "stub",
            }),
          listChildren: () => Promise.resolve({ ...emptyPage, cursors: [] }),
          getDescendants: () => Promise.resolve([]),
          listAll: () => Promise.resolve([]),
        },
      },
      http: {},
      path: "/",
    } as unknown as SubgraphArgs;

    const core = [
      new AnalyticsSubgraph(args),
      new SystemSubgraph(args),
      new ReactorSubgraph(args),
      new AuthSubgraph(args),
    ];
    const definitions = [
      ...core.map((subgraph) => definitionOf(subgraph, binder, true)),
      definitionOf(new DocumentModelSubgraph(MODEL, args), binder, false),
    ];
    schema = mergeSubgraphSchemas(
      filterBuildableSubgraphs(definitions, {
        error: (message: string) => {
          throw new Error(message);
        },
      } as never),
      "first",
    );
  });

  /** Runs one field's resolver as its operation would, recording what it touched. */
  async function run(
    parentType: GraphQLObjectType,
    field: GraphQLField<unknown, unknown>,
    operation: "query" | "mutation" | "subscription",
  ): Promise<Touches> {
    touched.length = 0;
    const info = {
      fieldName: field.name,
      parentType,
      returnType: field.type,
      operation: { operation },
      path: { key: field.name, prev: undefined, typename: parentType.name },
      schema,
      fragments: {},
      rootValue: undefined,
      variableValues: {},
      fieldNodes: [],
    } as unknown as GraphQLResolveInfo;
    const args = Object.fromEntries(
      field.args
        .filter((arg) => arg.deprecationReason == null)
        .map((arg) => [arg.name, stubValue(arg.type, arg.name)]),
    );
    const ctx = { headers: {}, db: null } as Context;
    let error: unknown;
    try {
      const resolver =
        operation === "subscription" ? field.subscribe : field.resolve;
      const result: unknown = await resolver?.(undefined, args, ctx, info);
      if (operation === "subscription" && result) {
        const stream = result as AsyncIterator<unknown>;
        await Promise.race([
          stream.next(),
          new Promise((resolve) => setTimeout(resolve, 20)),
        ]);
        await stream.return?.();
      }
    } catch (caught) {
      error = caught;
    }
    return { touched: [...touched], error };
  }

  /** Every resolvable field of an operation, namespace types walked one level. */
  function fieldsOf(root: GraphQLObjectType | null | undefined): Array<{
    parent: GraphQLObjectType;
    field: GraphQLField<unknown, unknown>;
  }> {
    if (!root) return [];
    const found: Array<{
      parent: GraphQLObjectType;
      field: GraphQLField<unknown, unknown>;
    }> = [];
    for (const field of Object.values(root.getFields())) {
      const named: GraphQLNamedType = getNamedType(field.type);
      const namespace =
        isObjectType(named) &&
        /(Queries|Mutations)$/.test(named.name) &&
        !isListType(field.type);
      if (namespace) {
        for (const inner of Object.values(named.getFields())) {
          found.push({ parent: named, field: inner });
        }
      } else {
        found.push({ parent: root, field });
      }
    }
    return found;
  }

  const coordinate = (parent: GraphQLObjectType, field: { name: string }) =>
    `${parent.name}.${field.name}`;

  const refusedWrite = (error: unknown) =>
    error instanceof Error &&
    error.message.includes("ctx.clients.write is only available");

  const usedFacade = (error: unknown) =>
    error instanceof Error &&
    error.message.includes("BaseSubgraph.reactorClient");

  it("binds the write-side queries by name, and only these", () => {
    expect(Object.keys(WRITE_SIDE_QUERIES).sort()).toEqual([
      "evaluateActions",
      "jobStatus",
      "peerAgreement",
      "pollSyncEnvelopes",
      "syncHolds",
    ]);
    expect(WRITE_HALF_QUERIES).toEqual(["Query.evaluateActions"]);
  });

  it("no query or subscription resolver reaches for the write half", async () => {
    const offenders: string[] = [];
    const roots = [
      [schema.getQueryType(), "query"],
      [schema.getSubscriptionType(), "subscription"],
    ] as const;
    let checked = 0;
    for (const [root, operation] of roots) {
      for (const { parent, field } of fieldsOf(root)) {
        const name = coordinate(parent, field);
        const { touched: seen, error } = await run(parent, field, operation);
        checked++;
        const wrote = seen.some((member) => member.startsWith("write."));
        if (WRITE_HALF_QUERIES.includes(name)) {
          if (!wrote) offenders.push(`${name} never reached the write half`);
          continue;
        }
        if (wrote || refusedWrite(error)) {
          offenders.push(`${name} reached for the write half`);
        }
        if (usedFacade(error)) offenders.push(`${name} used the facade`);
      }
    }
    expect(checked).toBeGreaterThan(20);
    expect(offenders).toEqual([]);
  });

  it("reads drive nodes through the read half", async () => {
    const query = schema.getQueryType()!;
    for (const name of ["driveNodes", "driveNode", "driveDescendants"]) {
      const field = query.getFields()[name];
      expect(field, name).toBeDefined();
      const { touched: seen, error } = await run(query, field, "query");
      expect(error, name).toBeUndefined();
      expect(seen, name).toContain("read.isServed");
      expect(
        seen.filter((member) => member.startsWith("write.")),
        name,
      ).toEqual([]);
    }
  });

  it("every mutation resolver writes through the write half", async () => {
    const offenders: string[] = [];
    const seenNames: string[] = [];
    for (const { parent, field } of fieldsOf(schema.getMutationType())) {
      const name = coordinate(parent, field);
      seenNames.push(name);
      const { touched: seen, error } = await run(parent, field, "mutation");
      const wrote = seen.some((member) => member.startsWith("write."));
      if (usedFacade(error)) offenders.push(`${name} used the facade`);
      if (MUTATIONS_WITHOUT_WRITE_CLIENT.includes(name)) {
        if (wrote) offenders.push(`${name} is listed as not writing but wrote`);
        continue;
      }
      if (!wrote) {
        offenders.push(
          `${name} never reached the write half (${String(error)})`,
        );
      }
    }
    expect(offenders).toEqual([]);
    expect(
      MUTATIONS_WITHOUT_WRITE_CLIENT.filter(
        (name) => !seenNames.includes(name),
      ),
    ).toEqual([]);
  });
});
