import type { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import type {
  IReactorClient,
  IRelationalDb,
  ISyncManager,
} from "@powerhousedao/reactor";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";
import { gql } from "graphql-tag";
import type http from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WebSocketServer } from "ws";
import { BaseSubgraph } from "../src/graphql/base-subgraph.js";
import { createGatewayAdapter } from "../src/graphql/gateway/factory.js";
import type {
  AdapterRouteHandle,
  FetchHandler,
  IHttpAdapter,
} from "../src/graphql/gateway/types.js";
import { createRequireAuthFetchMiddleware } from "../src/graphql/gateway/require-auth-middleware.js";
import { GraphQLManager } from "../src/graphql/graphql-manager.js";
import type { Context } from "../src/graphql/types.js";
import {
  AuthorizationPolicy,
  createAuthorizationService,
} from "../src/services/authorization.service.js";

function makeLogger(): ILogger {
  const logger: ILogger = {
    level: "error",
    verbose: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: (...a: unknown[]) => console.warn(...a),
    error: (...a: unknown[]) => console.error(...a),
    errorHandler: vi.fn(),
    child: () => logger,
  };
  return logger;
}

/** The one model the manager insists on at init; nothing here reads it. */
const DRIVE_MODEL = {
  documentModel: {
    global: {
      name: "DocumentDrive",
      id: "powerhouse/document-drive",
      specifications: [
        {
          version: 1,
          modules: [],
          state: {
            global: { schema: "type DocumentDriveState { name: String }" },
            local: { schema: "" },
          },
        },
      ],
    },
  },
} as unknown as DocumentModelModule;

/** An index-like subgraph: answers who asked, and a mutation nobody may run in process. */
class WhoAmISubgraph extends BaseSubgraph {
  override name = "whoami";
  override typeDefs = gql`
    type Query {
      whoami(greeting: String!): String!
    }
    type Mutation {
      touch: Boolean!
    }
  `;
  override resolvers = {
    Query: {
      whoami: (_p: unknown, args: { greeting: string }, ctx: Context) =>
        `${args.greeting} ${ctx.user?.address ?? "anonymous"}`,
    },
    Mutation: { touch: () => true },
  };
  additionalContextFields = {};
  override async onSetup() {}
  override async onDisconnect() {}
}

async function makeManager() {
  const handle = (): AdapterRouteHandle => ({ dispose: vi.fn() });
  const logger = makeLogger();
  // The real stitching adapter: its per-subgraph handler executes the schema
  // the manager built, in the same realm, as the switchboard runs it.
  const gatewayAdapter = await createGatewayAdapter("stitching", logger);
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
  return new GraphQLManager({
    path: "/",
    httpServer: {} as http.Server,
    wsServer: {
      close: vi.fn((cb?: () => void) => cb?.()),
      setMaxListeners: vi.fn(),
    } as unknown as WebSocketServer,
    reactorClient: {
      getDocumentModelModules: vi
        .fn()
        .mockResolvedValue({ results: [DRIVE_MODEL] }),
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
    featureFlags: { enableDocumentModelSubgraphs: false },
    authorizationService: createAuthorizationService({
      admins: [],
      defaultProtection: false,
      policy: AuthorizationPolicy.OPEN,
    }),
  });
}

const user = { address: "0xabc", chainId: 1, networkId: "eip155", appKey: "k" };

describe("GraphQLManager.executeSubgraph", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  async function ready(floor = false) {
    const manager = await makeManager();
    // Registered as a core subgraph: the supergraph the init builds needs a
    // root type, and the handler is then mounted by init's own router update.
    const pending = manager.init(
      [WhoAmISubgraph as never],
      undefined,
      floor ? createRequireAuthFetchMiddleware() : undefined,
    );
    await vi.runAllTimersAsync();
    await pending;
    expect(manager.hasSubgraphHandler("whoami")).toBe(true);
    return manager;
  }

  it("runs a query against the named subgraph as the given user, in process", async () => {
    const manager = await ready();
    const result = await manager.executeSubgraph("whoami", {
      query: "query ($g: String!) { whoami(greeting: $g) }",
      variables: { g: "hello" },
      user,
    });
    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({ whoami: "hello 0xabc" });
    // anonymous, with no floor: the resolver sees no user
    const anonymous = await manager.executeSubgraph("whoami", {
      query: '{ whoami(greeting: "hi") }',
    });
    expect(anonymous.data).toEqual({ whoami: "hi anonymous" });
  });

  it("refuses an anonymous caller under the authenticated-caller floor, as HTTP would", async () => {
    const manager = await ready(true);
    await expect(
      manager.executeSubgraph("whoami", {
        query: '{ whoami(greeting: "hi") }',
      }),
    ).rejects.toThrow(/authentication required/i);
    const signedIn = await manager.executeSubgraph("whoami", {
      query: '{ whoami(greeting: "hi") }',
      user,
    });
    expect(signedIn.data).toEqual({ whoami: "hi 0xabc" });
  });

  it("lets the host itself past the floor, recording no user", async () => {
    const manager = await ready(true);
    const asHost = await manager.executeSubgraph("whoami", {
      query: '{ whoami(greeting: "hi") }',
      asHost: true,
    });
    expect(asHost.errors).toBeUndefined();
    expect(asHost.data).toEqual({ whoami: "hi anonymous" });
  });

  it("refuses a mutation and an unknown subgraph by name", async () => {
    const manager = await ready();
    await expect(
      manager.executeSubgraph("whoami", { query: "mutation { touch }", user }),
    ).rejects.toThrow(/queries only; mutation refused/);
    await expect(
      manager.executeSubgraph("nope", { query: "{ whoami }", user }),
    ).rejects.toThrow(/Unknown subgraph: nope/);
  });
});
