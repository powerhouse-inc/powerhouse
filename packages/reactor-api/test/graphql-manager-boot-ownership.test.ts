// The supergraph built at init applies claim ownership like later updates.
import type { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import type {
  IReactorClient,
  IRelationalDb,
  ISyncManager,
} from "@powerhousedao/reactor";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";
import type { DocumentNode } from "graphql";
import { gql } from "graphql-tag";
import type http from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WebSocketServer } from "ws";
import type {
  AdapterRouteHandle,
  FetchHandler,
  IGatewayAdapter,
  IHttpAdapter,
  SubgraphDefinition,
} from "../src/graphql/gateway/types.js";
import { GraphQLManager } from "../src/graphql/graphql-manager.js";
import { ReactorSubgraph } from "../src/graphql/reactor/subgraph.js";
import type {
  Context,
  ISubgraph,
  SubgraphClass,
} from "../src/graphql/types.js";
import {
  AuthorizationPolicy,
  createAuthorizationService,
} from "../src/services/authorization.service.js";

const CLAIM_EXCLUSION = "Excluding subgraph @name from the supergraph: @error";

function makeLogger(): ILogger {
  const logger: ILogger = {
    level: "error",
    verbose: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    errorHandler: vi.fn(),
    child: () => logger,
  };
  return logger;
}

function makeModel(name: string, id: string): DocumentModelModule {
  return {
    documentModel: {
      global: {
        name,
        id,
        specifications: [
          {
            version: 1,
            modules: [
              {
                name: "core",
                operations: [
                  {
                    name: "doThing",
                    schema: "input DoThingInput { x: String }",
                  },
                ],
              },
            ],
            state: {
              global: { schema: `type ${name}State { name: String }` },
              local: { schema: "" },
            },
          },
        ],
      },
    },
  } as unknown as DocumentModelModule;
}

/** Builds the supergraph on handler creation, as stitching and mercurius do. */
function makeHarness(models: DocumentModelModule[]) {
  const logger = makeLogger();
  const supergraphs: string[][] = [];
  let getDefinitions: (() => SubgraphDefinition[]) | undefined;
  const build = () => {
    supergraphs.push(
      getDefinitions!().map((d) => d.name.replace(":graphql/", "")),
    );
  };
  const gatewayAdapter = {
    start: vi.fn().mockResolvedValue(undefined),
    createHandler: vi
      .fn()
      .mockResolvedValue(() => Promise.resolve(new Response("ok"))),
    createSupergraphHandler: vi.fn((getSubgraphs: typeof getDefinitions) => {
      getDefinitions = getSubgraphs;
      build();
      return Promise.resolve(() => Promise.resolve(new Response("ok")));
    }),
    updateSupergraph: vi.fn(() => {
      build();
      return Promise.resolve();
    }),
    stop: vi.fn().mockResolvedValue(undefined),
  } as unknown as IGatewayAdapter<Context>;
  const handle = (): AdapterRouteHandle => ({ dispose: vi.fn() });
  const httpAdapter: IHttpAdapter = {
    setupMiddleware: vi.fn(),
    mount: vi.fn((_path: string, _handler: FetchHandler) => handle()),
    getRoute: vi.fn(handle),
    mountRawMiddleware: vi.fn(),
    mountNodeRoute: vi.fn(handle),
    listen: vi.fn().mockResolvedValue({}),
    setupSentryErrorHandler: vi.fn(),
    handle: {},
  };
  const manager = new GraphQLManager({
    path: "/",
    httpServer: {} as http.Server,
    wsServer: {
      close: vi.fn((cb?: () => void) => cb?.()),
      setMaxListeners: vi.fn(),
    } as unknown as WebSocketServer,
    reactorClient: {
      getDocumentModelModules: vi.fn().mockResolvedValue({ results: models }),
      find: vi
        .fn()
        .mockResolvedValue({ results: [], options: { cursor: "", limit: 1 } }),
    } as unknown as IReactorClient,
    relationalDb: {} as IRelationalDb,
    analyticsStore: {} as IAnalyticsStore,
    syncManager: {} as ISyncManager,
    logger,
    httpAdapter,
    gatewayAdapter,
    featureFlags: { enableDocumentModelSubgraphs: true },
    authorizationService: createAuthorizationService({
      admins: [],
      defaultProtection: false,
      policy: AuthorizationPolicy.OPEN,
    }),
  });
  return { manager, logger, supergraphs };
}

async function init(manager: GraphQLManager, core: SubgraphClass[]) {
  const pending = manager.init(core);
  await vi.runAllTimersAsync();
  await pending;
}

function hostSubgraph(name: string, typeDefs: DocumentNode): ISubgraph {
  return {
    name,
    typeDefs,
    resolvers: {},
    relationalDb: {} as IRelationalDb,
    reactorClient: {} as IReactorClient,
  } as unknown as ISubgraph;
}

const drive = makeModel("DocumentDrive", "powerhouse/document-drive");

const pagingSubset = gql`
  input PagingInput {
    limit: Int
  }
  type Query {
    things(paging: PagingInput): [String!]!
  }
`;

describe("the first supergraph", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("excludes a subgraph registered before init that loses a claim to a core subgraph", async () => {
    const { manager, logger, supergraphs } = makeHarness([drive]);
    await manager.registerSubgraphInstance(
      hostSubgraph("paging", pagingSubset),
      "graphql",
    );

    await init(manager, [ReactorSubgraph]);

    const [first, ...updates] = supergraphs;
    expect(updates.length).toBeGreaterThan(0);
    expect(first).toContain("r");
    expect(first).not.toContain("paging");
    for (const update of updates) expect(update).toEqual(first);
    expect(logger.error).toHaveBeenCalledWith(
      CLAIM_EXCLUSION,
      "paging",
      expect.stringContaining('PagingInput (owned by "r")'),
    );
  });

  it("excludes a boot model's subgraph that loses a claim to a subgraph registered before init", async () => {
    const { manager, supergraphs } = makeHarness([
      drive,
      makeModel("TodoList", "test/todo-list"),
    ]);
    // The host outranks document models.
    await manager.registerSubgraphInstance(
      hostSubgraph(
        "todo-list-custom",
        gql`
          type TodoListQueries {
            example(driveId: String!): String
          }
          type Query {
            todoList: TodoListQueries!
          }
        `,
      ),
      "graphql",
    );

    await init(manager, [ReactorSubgraph]);

    const [first, ...updates] = supergraphs;
    expect(first).toContain("todo-list-custom");
    expect(first).not.toContain("todo-list");
    for (const update of updates) expect(update).toEqual(first);
  });
});
