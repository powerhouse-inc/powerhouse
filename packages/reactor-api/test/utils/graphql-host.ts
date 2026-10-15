import type { IReactorClient, PagedResults } from "@powerhousedao/reactor";
import type {
  DocumentModelModule,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import { createRequire } from "node:module";
import type * as GraphQL from "graphql";
import type { ExecutionResult, GraphQLSchema } from "graphql";
import { DocumentModelSubgraph } from "../../src/graphql/document-model-subgraph.js";
import type { Context, SubgraphArgs } from "../../src/graphql/types.js";
import type { IAuthorizationService } from "../../src/services/authorization.service.js";
import { createSchema } from "../../src/utils/create-schema.js";

/**
 * `@apollo/subgraph` loads graphql's CommonJS entry, and an `import` in a test
 * loads the ESM entry. graphql checks type identity with `instanceof`, so tests
 * execute with the same copy the schema builder used.
 */
const {
  buildSchema,
  graphql,
  lexicographicSortSchema,
  printSchema: printGraphQLSchema,
} = createRequire(import.meta.url)("graphql") as typeof GraphQL;

export function printSchema(schema: GraphQLSchema | string): string {
  return printGraphQLSchema(
    lexicographicSortSchema(
      typeof schema === "string" ? buildSchema(schema) : schema,
    ),
  );
}

export function asSchemaFirst(
  module: DocumentModelModule,
): DocumentModelModule {
  const { definition: _definition, ...rest } = module as DocumentModelModule & {
    definition?: unknown;
  };
  return rest as DocumentModelModule;
}

type StoredOperation = {
  readonly error?: string;
  readonly action: { readonly input: unknown };
};

type ScopedOperations = Readonly<Record<string, readonly StoredOperation[]>>;

function operationsByScope(document: PHDocument): ScopedOperations {
  return document.operations as unknown as ScopedOperations;
}

function appendedSince(
  document: PHDocument,
  before: Readonly<Record<string, number>>,
): readonly StoredOperation[] {
  const scopes = operationsByScope(document);
  return Object.keys(scopes)
    .sort()
    .flatMap((scope) => scopes[scope].slice(before[scope] ?? 0));
}

function operationCounts(
  document: PHDocument,
): Readonly<Record<string, number>> {
  const scopes = operationsByScope(document);
  return Object.fromEntries(
    Object.keys(scopes).map((scope) => [scope, scopes[scope].length]),
  );
}

export function reactorClientFor(module: DocumentModelModule): {
  readonly client: IReactorClient;
  current: () => PHDocument;
} {
  const utils = (
    module as unknown as {
      utils: { createDocument: () => PHDocument };
    }
  ).utils;
  let document = utils.createDocument();
  const execute = (
    _id: string,
    _branch: string,
    actions: readonly { type: string }[],
  ) => {
    const reducer = (
      module as unknown as {
        reducer: (doc: PHDocument, action: unknown) => PHDocument;
      }
    ).reducer;
    const before = operationCounts(document);
    for (const action of actions) document = reducer(document, action);
    const failure = appendedSince(document, before).find(
      (operation) => operation.error !== undefined,
    );
    if (failure?.error !== undefined) throw new Error(failure.error);
    return Promise.resolve(document);
  };
  const client = {
    resolveIdOrSlug: (identifier: string) => Promise.resolve(identifier),
    get: () => Promise.resolve(document),
    getOutgoingRelationships: () =>
      Promise.resolve({
        results: [],
        options: { cursor: "", limit: 0 },
      } satisfies PagedResults<PHDocument>),
    execute,
    executeAsync: async (
      id: string,
      branch: string,
      actions: readonly { type: string }[],
    ) => {
      await execute(id, branch, actions);
      return { id: "job-1" };
    },
  } as unknown as IReactorClient;
  return { client, current: () => document };
}

export function subgraphArgs(
  client: IReactorClient,
  authorization: Partial<IAuthorizationService> = {},
): SubgraphArgs {
  const authorizationService: Partial<IAuthorizationService> = {
    config: { admins: [], defaultProtection: false } as never,
    isSupremeAdmin: () => true,
    canCreate: () => true,
    canRead: () => Promise.resolve(true),
    canWrite: () => Promise.resolve(true),
    canManage: () => Promise.resolve(true),
    canMutate: () => Promise.resolve(true),
    ...authorization,
  } as unknown as Partial<IAuthorizationService>;
  return {
    reactorClient: client,
    authorizationService: authorizationService as IAuthorizationService,
    relationalDb: {},
    analyticsStore: {},
    graphqlManager: { reactorDriveClient: {} },
    syncManager: {},
  } as unknown as SubgraphArgs;
}

type Host = {
  readonly schema: GraphQLSchema;
  readonly run: (
    source: string,
    variableValues?: Record<string, unknown>,
  ) => Promise<ExecutionResult>;
  readonly state: () => Record<string, unknown>;
  readonly inputs: () => readonly unknown[];
};

export function hostFor(
  module: DocumentModelModule,
  authorization: Partial<IAuthorizationService> = {},
): Host {
  const { client, current } = reactorClientFor(module);
  const subgraph = new DocumentModelSubgraph(
    module,
    subgraphArgs(client, authorization),
  );
  const schema = createSchema(
    [module],
    subgraph.resolvers as never,
    subgraph.typeDefs,
  );
  return {
    schema,
    run: (source, variableValues) =>
      graphql({
        schema,
        source,
        variableValues,
        contextValue: { user: { address: "0xowner" } } as unknown as Context,
      }),
    state: () =>
      (current().state as unknown as { global: Record<string, unknown> })
        .global,
    inputs: () =>
      (operationsByScope(current()).global ?? []).map(
        (operation) => operation.action.input,
      ),
  };
}

export function messages(result: ExecutionResult): readonly string[] {
  return (result.errors ?? []).map((error) => error.message);
}
