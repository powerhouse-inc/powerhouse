import type { IReactorClient, PagedResults } from "@powerhousedao/reactor";
import type {
  Action,
  DocumentModelModule,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import { createRequire } from "node:module";
import type * as GraphQL from "graphql";
import type { ExecutionResult, GraphQLSchema } from "graphql";
import { DocumentModelSubgraph } from "../../src/graphql/document-model-subgraph.js";
import type { Context, SubgraphArgs } from "../../src/graphql/types.js";
import {
  AuthorizationPolicy,
  type IAuthorizationService,
} from "../../src/services/authorization.service.js";
import { createSchema } from "../../src/utils/create-schema.js";
import { withHalves } from "./client-halves.js";

/**
 * `@apollo/subgraph` loads graphql's CommonJS entry and a test `import` loads
 * the ESM one; graphql checks type identity, so tests use the CommonJS copy.
 */
const graphqlCjs = createRequire(import.meta.url)("graphql") as typeof GraphQL;

export function sortedSchema(schema: GraphQLSchema): string {
  return graphqlCjs.printSchema(graphqlCjs.lexicographicSortSchema(schema));
}

function memoryReactor(
  module: DocumentModelModule,
  initial: PHDocument = module.utils.createDocument(),
): {
  client: IReactorClient;
  current: () => PHDocument;
} {
  let document: PHDocument = {
    ...initial,
    header: { ...initial.header, id: "doc-1", slug: "doc-1" },
  };
  const execute = (_id: string, _branch: string, actions: Action[]) => {
    for (const action of actions) document = module.reducer(document, action);
    return Promise.resolve(document);
  };
  const client = {
    resolveIdOrSlug: (identifier: string) => Promise.resolve(identifier),
    isServed: () => Promise.resolve(true),
    get: () => Promise.resolve(document),
    getOutgoingRelationships: () =>
      Promise.resolve({
        results: [],
        options: { cursor: "", limit: 0 },
      } satisfies PagedResults<PHDocument>),
    getDocumentModelModule: () => Promise.resolve(module),
    createEmpty: () => Promise.resolve(document),
    execute,
  } as unknown as IReactorClient;
  return { client, current: () => document };
}

export function recordingAuthorization(denied?: string): {
  readonly authorization: IAuthorizationService;
  readonly checked: string[];
} {
  const checked: string[] = [];
  const authorization = {
    config: {
      admins: [],
      defaultProtection: false,
      policy: AuthorizationPolicy.DOCUMENT_PERMISSIONS,
    },
    isSupremeAdmin: () => false,
    canCreate: () => true,
    canRead: () => Promise.resolve(true),
    canWrite: () => Promise.resolve(true),
    canManage: () => Promise.resolve(true),
    canMutate: (_documentId: string, operationType: string) => {
      checked.push(operationType);
      return Promise.resolve(operationType !== denied);
    },
  } as unknown as IAuthorizationService;
  return { authorization, checked };
}

export type ModelHost = {
  readonly schema: GraphQLSchema;
  readonly run: (
    source: string,
    variableValues?: Record<string, unknown>,
  ) => Promise<ExecutionResult>;
  readonly document: () => PHDocument;
};

export function hostFor(
  module: DocumentModelModule,
  authorization: IAuthorizationService = recordingAuthorization().authorization,
  initial?: PHDocument,
): ModelHost {
  const { client, current } = memoryReactor(module, initial);
  const subgraph = new DocumentModelSubgraph(module, {
    reactorClient: client,
    authorizationService: authorization,
    relationalDb: {},
    analyticsStore: {},
    graphqlManager: { reactorDriveClient: undefined },
    syncManager: {},
  } as unknown as SubgraphArgs);
  const schema = createSchema(
    [module],
    subgraph.resolvers as never,
    subgraph.typeDefs,
    { ownTypeNames: subgraph.generatedTypeNames },
  );
  return {
    schema,
    run: (source, variableValues) =>
      graphqlCjs.graphql({
        schema,
        source,
        variableValues,
        contextValue: withHalves(
          { user: { address: "0xowner" } },
          client,
        ) as unknown as Context,
      }),
    document: current,
  };
}

export function messages(result: ExecutionResult): string[] {
  return (result.errors ?? []).map((error) => error.message);
}
