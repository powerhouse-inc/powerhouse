/**
 * Unit tests for GraphQLManager.
 *
 * Uses mock implementations of IGatewayAdapter and IHttpAdapter so tests
 * run without spinning up real HTTP or GraphQL servers.
 *
 * The mount() spy captures FetchHandlers as they are registered, allowing
 * tests to invoke individual handlers (e.g. the drive info endpoint) directly
 * via the Fetch API without any network I/O.
 */

import type { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import type {
  IReactorClient,
  IRelationalDb,
  ISyncManager,
} from "@powerhousedao/reactor";
import {
  createReactorDriveResolvers,
  REACTOR_DRIVE_SUBGRAPH_NAME,
  reactorDriveDocumentModelModule,
  reactorDriveSubgraphTypeDefs,
} from "@powerhousedao/reactor-drive";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule, type ILogger } from "document-model";
import { type DocumentNode, Kind } from "graphql";
import { gql } from "graphql-tag";
import type http from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WebSocketServer } from "ws";
import { BaseSubgraph } from "../src/graphql/base-subgraph.js";
import { DocumentModelSubgraph } from "../src/graphql/document-model-subgraph.js";
import { AnalyticsSubgraph } from "../src/graphql/analytics-subgraph.js";
import { ReactorSubgraph } from "../src/graphql/reactor/subgraph.js";
import { SystemSubgraph } from "../src/graphql/system/subgraph.js";
import { getGeneratedDocumentModelTypes } from "../src/utils/create-schema.js";

import {
  createAuthFetchMiddleware,
  type AuthFetchMiddleware,
} from "../src/graphql/gateway/auth-middleware.js";
import type { IAuthorizationService } from "../src/services/authorization.service.js";
import type { IAttachmentClientProvider } from "../src/services/authorized-attachment.service.js";
import type { IAttachmentClient } from "@powerhousedao/reactor-attachments/client";
import type {
  AdapterRouteHandle,
  FetchHandler,
  IGatewayAdapter,
  IHttpAdapter,
  WsConnection,
  WsDisposer,
  WsHandlers,
} from "../src/graphql/gateway/types.js";
import {
  createRequireAuthFetchMiddleware,
  type RequireAuthFetchMiddleware,
} from "../src/graphql/gateway/require-auth-middleware.js";
import { GraphQLManager } from "../src/graphql/graphql-manager.js";
import {
  AuthorizationPolicy,
  createAuthorizationService,
} from "../src/services/authorization.service.js";
import type {
  Context,
  ISubgraph,
  SubgraphArgs,
  SubgraphClass,
} from "../src/graphql/types.js";
import type { AuthContext, AuthService } from "../src/services/auth.service.js";

// ── shared fixtures ──────────────────────────────────────────────────────────

const silentLogger: ILogger = {
  level: "error" as const,
  verbose: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  errorHandler: vi.fn(),
  child: () => silentLogger,
};

/** An ILogger whose methods are spies, for asserting on log calls. */
function makeHarnessLogger(): ILogger {
  const logger: ILogger = {
    level: "error" as const,
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

/** Minimal DocumentModelModule with a DocumentDrive model - required by init(). */
function makeDriveModule(): DocumentModelModule {
  return {
    documentModel: {
      global: {
        name: "DocumentDrive",
        id: "powerhouse/document-drive",
        specifications: [
          {
            version: 1,
            modules: [],
            // Provide a minimal state schema so buildSubgraphSchemaModule can
            // generate the DocumentDrive_DocumentDriveState type that is
            // referenced by the DocumentDrive type definition.
            state: {
              global: { schema: "type DocumentDriveState { name: String }" },
              local: { schema: "" },
            },
          },
        ],
      },
    },
  } as unknown as DocumentModelModule;
}

/** A minimal second document model, shaped like makeDriveModule. */
function makeModelModule(name: string, id: string): DocumentModelModule {
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
                    schema:
                      "input DoThingInput { x: String }\ntype DoThingResult { ok: Boolean }",
                  },
                ],
              },
            ],
            state: {
              global: {
                schema: `type ${name}State { name: String }`,
              },
              local: { schema: "" },
            },
          },
        ],
      },
    },
  } as unknown as DocumentModelModule;
}

function makeMockReactorClient(
  overrides: Partial<IReactorClient> = {},
): IReactorClient {
  return {
    getDocumentModelModules: vi
      .fn()
      .mockResolvedValue({ results: [makeDriveModule()] }),
    get: vi.fn().mockResolvedValue({
      header: { id: "drive-1", slug: "my-drive", meta: {} },
      state: { global: { name: "Test Drive", icon: null } },
    }),
    find: vi.fn().mockResolvedValue({
      results: [],
      options: { cursor: "", limit: 100 },
    }),
    ...overrides,
  } as unknown as IReactorClient;
}

function makeMockGatewayAdapter(): IGatewayAdapter<Context> & {
  start: ReturnType<typeof vi.fn>;
  createHandler: ReturnType<typeof vi.fn>;
  createSupergraphHandler: ReturnType<typeof vi.fn>;
  updateSupergraph: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  attachWebSocket: ReturnType<typeof vi.fn>;
} {
  return {
    start: vi.fn().mockResolvedValue(undefined),
    createHandler: vi
      .fn()
      .mockResolvedValue(() => Promise.resolve(new Response("handler ok"))),
    createSupergraphHandler: vi
      .fn()
      .mockResolvedValue(() => Promise.resolve(new Response("supergraph ok"))),
    updateSupergraph: vi.fn().mockResolvedValue(undefined),
    attachWebSocket: vi
      .fn()
      .mockReturnValue({ dispose: vi.fn() } satisfies WsDisposer),
    stop: vi.fn().mockResolvedValue(undefined),
  };
}

function makeMockHttpAdapter() {
  const mounts = new Map<string, FetchHandler>();
  const handles = new Map<string, AdapterRouteHandle>();
  const disposed: AdapterRouteHandle[] = [];
  const newHandle = (): AdapterRouteHandle => {
    const handle: AdapterRouteHandle = {
      dispose: vi.fn(() => {
        disposed.push(handle);
      }),
    };
    return handle;
  };
  const adapter: IHttpAdapter = {
    setupMiddleware: vi.fn(),
    mount: vi.fn((p: string, h: FetchHandler) => {
      mounts.set(p, h);
      const handle = newHandle();
      handles.set(p, handle);
      return handle;
    }),
    getRoute: vi.fn(() => newHandle()),
    mountRawMiddleware: vi.fn(),
    mountNodeRoute: vi.fn(() => newHandle()),
    listen: vi.fn().mockResolvedValue({}),
    setupSentryErrorHandler: vi.fn(),
    handle: {},
  };
  return { adapter, mounts, handles, disposed };
}

type HarnessOptions = {
  path?: string;
  enableDocumentModelSubgraphs?: boolean;
  reactorClient?: IReactorClient;
  logger?: ILogger;
  authorizationService?: IAuthorizationService;
  attachments?: IAttachmentClientProvider;
};

function makeHarness(options: HarnessOptions = {}) {
  const {
    adapter: httpAdapter,
    mounts,
    handles,
    disposed,
  } = makeMockHttpAdapter();
  const gatewayAdapter = makeMockGatewayAdapter();
  const reactorClient = options.reactorClient ?? makeMockReactorClient();
  const httpServer = {} as http.Server;
  const wsServer = {
    close: vi.fn((cb?: () => void) => cb?.()),
    setMaxListeners: vi.fn(),
  } as unknown as WebSocketServer;

  const manager = new GraphQLManager({
    path: options.path ?? "/",
    httpServer,
    wsServer,
    reactorClient,
    relationalDb: {} as IRelationalDb,
    analyticsStore: {} as IAnalyticsStore,
    syncManager: {} as ISyncManager,
    logger: options.logger ?? silentLogger,
    httpAdapter,
    gatewayAdapter,
    featureFlags: {
      enableDocumentModelSubgraphs:
        options.enableDocumentModelSubgraphs ?? false,
    },
    port: 4001,
    authorizationService:
      options.authorizationService ??
      createAuthorizationService({
        admins: [],
        defaultProtection: false,
        policy: AuthorizationPolicy.OPEN,
      }),
    attachments: options.attachments,
  });

  return {
    manager,
    httpAdapter,
    mounts,
    handles,
    disposed,
    gatewayAdapter,
    reactorClient,
    httpServer,
    wsServer,
  };
}

/** Run init() to completion, flushing the debounced updateRouter() call. */
async function initAndFlush(
  manager: GraphQLManager,
  coreSubgraphs: SubgraphClass[] = [],
  authMiddleware?: AuthFetchMiddleware,
  requireAuthMiddleware?: RequireAuthFetchMiddleware,
) {
  const initPromise = manager.init(
    coreSubgraphs,
    authMiddleware,
    requireAuthMiddleware,
  );
  await vi.runAllTimersAsync();
  await initPromise;
}

// ── tests ────────────────────────────────────────────────────────────────────

describe("GraphQLManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ── init() ─────────────────────────────────────────────────────────────────

  describe("init()", () => {
    it("throws when the DocumentDrive model is missing", async () => {
      const reactorClient = makeMockReactorClient({
        getDocumentModelModules: vi.fn().mockResolvedValue({ results: [] }),
      });
      const { manager } = makeHarness({ reactorClient });

      await expect(manager.init([])).rejects.toThrow(
        "DocumentDrive model required",
      );
    });

    it("starts the gateway adapter with the http server", async () => {
      const { manager, gatewayAdapter, httpServer } = makeHarness();
      await initAndFlush(manager);

      expect(gatewayAdapter.start).toHaveBeenCalledOnce();
      expect(gatewayAdapter.start).toHaveBeenCalledWith(httpServer);
    });

    it("sets up middleware on the http adapter", async () => {
      const { manager, httpAdapter } = makeHarness();
      await initAndFlush(manager);

      expect(httpAdapter.setupMiddleware).toHaveBeenCalledOnce();
      expect(httpAdapter.setupMiddleware).toHaveBeenCalledWith({
        bodyLimit: "50mb",
      });
    });

    it("mounts the drive info endpoint at {path}/d/:drive", async () => {
      const { manager, httpAdapter } = makeHarness({ path: "/" });
      await initAndFlush(manager);

      expect(httpAdapter.mount).toHaveBeenCalledWith(
        "/d/:drive",
        expect.any(Function),
      );
    });

    it("mounts the supergraph at {path}/graphql", async () => {
      const { manager, httpAdapter } = makeHarness({ path: "/" });
      await initAndFlush(manager);

      expect(httpAdapter.mount).toHaveBeenCalledWith(
        "/graphql",
        expect.any(Function),
      );
    });

    it("respects a non-root base path for mounted routes", async () => {
      const { manager, httpAdapter } = makeHarness({ path: "/api/v1" });
      await initAndFlush(manager);

      expect(httpAdapter.mount).toHaveBeenCalledWith(
        "/api/v1/d/:drive",
        expect.any(Function),
      );
      expect(httpAdapter.mount).toHaveBeenCalledWith(
        "/api/v1/graphql",
        expect.any(Function),
      );
    });

    it("calls createSupergraphHandler on the gateway adapter", async () => {
      const { manager, gatewayAdapter, httpServer } = makeHarness();
      await initAndFlush(manager);

      expect(gatewayAdapter.createSupergraphHandler).toHaveBeenCalledOnce();
      const [getSubgraphs, passedServer, contextFactory] =
        gatewayAdapter.createSupergraphHandler.mock.calls[0];
      expect(typeof getSubgraphs).toBe("function");
      expect(passedServer).toBe(httpServer);
      expect(typeof contextFactory).toBe("function");
    });
  });

  // ── drive info endpoint ────────────────────────────────────────────────────

  describe("drive info endpoint", () => {
    async function getHandler(
      options: HarnessOptions = {},
      authMiddleware?: AuthFetchMiddleware,
    ) {
      const harness = makeHarness(options);
      await initAndFlush(harness.manager, [], authMiddleware);
      const drivePath =
        (options.path === "/" || !options.path ? "" : options.path) +
        "/d/:drive";
      const handler = harness.mounts.get(drivePath);
      if (!handler) throw new Error(`No handler mounted at ${drivePath}`);
      return { handler, ...harness };
    }

    it("returns 404 when the drive is not found", async () => {
      const { handler } = await getHandler({
        reactorClient: makeMockReactorClient({
          get: vi.fn().mockRejectedValue(new Error("not found")),
        }),
      });

      const res = await handler(
        new Request("http://localhost/d/unknown-drive"),
      );
      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Drive not found");
    });

    it("returns 200 with drive info JSON when the drive exists", async () => {
      const { handler } = await getHandler();

      const res = await handler(
        new Request("http://localhost/d/my-drive", {
          headers: { host: "localhost" },
        }),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { graphqlEndpoint: string };
      expect(typeof body.graphqlEndpoint).toBe("string");
    });

    it("passes the drive ID from the URL to the reactor client, read as the anonymous caller", async () => {
      const { handler, reactorClient } = await getHandler();

      await handler(new Request("http://localhost/d/drive-abc-123"));

      expect(reactorClient.get).toHaveBeenCalledWith("drive-abc-123", {
        subject: { address: undefined, key: undefined },
      });
    });

    it("uses x-forwarded-proto when present", async () => {
      const { handler } = await getHandler({ path: "/" });

      const res = await handler(
        new Request("http://localhost/d/my-drive", {
          headers: {
            host: "example.com",
            "x-forwarded-proto": "https",
          },
        }),
      );
      const body = (await res.json()) as { graphqlEndpoint: string };
      expect(body.graphqlEndpoint).toMatch(/^https:\/\//);
    });

    it("falls back to the URL protocol when x-forwarded-proto is absent", async () => {
      const { handler } = await getHandler({ path: "/" });

      const res = await handler(
        new Request("http://localhost/d/my-drive", {
          headers: { host: "example.com" },
        }),
      );
      const body = (await res.json()) as { graphqlEndpoint: string };
      expect(body.graphqlEndpoint).toMatch(/^http:\/\//);
    });

    it("includes the base path in the graphql endpoint URL", async () => {
      const { handler } = await getHandler({ path: "/api/v1" });

      const res = await handler(
        new Request("http://localhost/api/v1/d/my-drive", {
          headers: { host: "example.com" },
        }),
      );
      const body = (await res.json()) as { graphqlEndpoint: string };
      expect(body.graphqlEndpoint).toBe("http://example.com/api/v1/graphql/r");
    });

    it("omits the base path from the graphql endpoint URL when path is /", async () => {
      const { handler } = await getHandler({ path: "/" });

      const res = await handler(
        new Request("http://localhost/d/my-drive", {
          headers: { host: "example.com" },
        }),
      );
      const body = (await res.json()) as { graphqlEndpoint: string };
      expect(body.graphqlEndpoint).toBe("http://example.com/graphql/r");
    });

    // ── authorization ──────────────────────────────────────────────────────
    //
    // Drive metadata is a document read. Before this gate the endpoint was
    // mounted raw — outside every middleware — so it answered any anonymous
    // caller with the drive's id, slug, name, icon and meta.

    function denyingAuthorizationService(): IAuthorizationService {
      return createAuthorizationService({
        admins: [],
        defaultProtection: false,
        policy: AuthorizationPolicy.ADMIN_ONLY,
      });
    }

    function authServiceFor(user: AuthContext["user"]): AuthService {
      return {
        authenticateRequest: vi.fn().mockResolvedValue({
          user,
          admins: [],
          auth_enabled: true,
        }),
      } as unknown as AuthService;
    }

    it("refuses a drive the caller may not read", async () => {
      const { handler } = await getHandler({
        authorizationService: denyingAuthorizationService(),
      });

      const res = await handler(
        new Request("http://localhost/d/my-drive", {
          headers: { host: "localhost" },
        }),
      );

      expect(res.status).toBe(404);
    });

    it("reports a refused drive as 'not found', never as forbidden", async () => {
      // A 403 would confirm the drive exists, letting an anonymous caller
      // enumerate protected drives by probing slugs. The refusal has to be
      // byte-identical to the genuine miss.
      const { handler: refused } = await getHandler({
        authorizationService: denyingAuthorizationService(),
      });
      const { handler: missing } = await getHandler({
        reactorClient: makeMockReactorClient({
          get: vi.fn().mockRejectedValue(new Error("not found")),
        }),
      });

      const refusedRes = await refused(
        new Request("http://localhost/d/my-drive", {
          headers: { host: "localhost" },
        }),
      );
      const missingRes = await missing(
        new Request("http://localhost/d/no-such-drive", {
          headers: { host: "localhost" },
        }),
      );

      expect(refusedRes.status).toBe(missingRes.status);
      await expect(refusedRes.json()).resolves.toEqual(await missingRes.json());
    });

    it("withholds drive metadata from a caller who may not read it", async () => {
      const { handler } = await getHandler({
        authorizationService: denyingAuthorizationService(),
      });

      const res = await handler(
        new Request("http://localhost/d/my-drive", {
          headers: { host: "localhost" },
        }),
      );

      const body = (await res.json()) as Record<string, unknown>;
      expect(body).not.toHaveProperty("slug");
      expect(body).not.toHaveProperty("name");
      expect(body).not.toHaveProperty("icon");
      expect(body).not.toHaveProperty("meta");
      expect(body).not.toHaveProperty("graphqlEndpoint");
    });

    it("admits an authorized caller, resolving identity from the bearer", async () => {
      const { handler } = await getHandler(
        {
          authorizationService: createAuthorizationService({
            admins: ["0xadmin"],
            defaultProtection: false,
            policy: AuthorizationPolicy.ADMIN_ONLY,
          }),
        },
        createAuthFetchMiddleware(
          authServiceFor({
            address: "0xadmin",
            chainId: 1,
            networkId: "mainnet",
            appKey: "did:key:zadmin",
          }),
        ),
      );

      const res = await handler(
        new Request("http://localhost/d/my-drive", {
          headers: { host: "localhost" },
        }),
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as { graphqlEndpoint: string };
      expect(typeof body.graphqlEndpoint).toBe("string");
    });

    it("stays open to anonymous callers under the OPEN policy", async () => {
      // Drive discovery is the one read a client makes before it can
      // authenticate: Connect reads graphqlEndpoint from here to register the
      // sync remote. An unauthenticated switchboard must keep answering.
      const { handler } = await getHandler();

      const res = await handler(
        new Request("http://localhost/d/my-drive", {
          headers: { host: "localhost" },
        }),
      );

      expect(res.status).toBe(200);
    });
  });

  // ── context factory ────────────────────────────────────────────────────────

  describe("context factory", () => {
    it("includes request headers in the GraphQL context", async () => {
      const { manager, gatewayAdapter } = makeHarness();
      await initAndFlush(manager);

      // Extract the contextFactory passed to createSupergraphHandler
      const [, , contextFactory] =
        gatewayAdapter.createSupergraphHandler.mock.calls[0];

      const ctx = await contextFactory(
        new Request("http://localhost/graphql", {
          headers: { authorization: "Bearer token123", "x-custom": "value" },
        }),
      );

      expect(ctx.headers["authorization"]).toBe("Bearer token123");
      expect(ctx.headers["x-custom"]).toBe("value");
    });

    it("merges additional context fields into the GraphQL context", async () => {
      const { manager, gatewayAdapter } = makeHarness();
      manager.setAdditionalContextFields({ customField: "custom-value" });
      await initAndFlush(manager);

      const [, , contextFactory] =
        gatewayAdapter.createSupergraphHandler.mock.calls[0];
      const ctx = (await contextFactory(
        new Request("http://localhost/graphql"),
      )) as Record<string, unknown>;

      expect(ctx["customField"]).toBe("custom-value");
    });

    it("populates user from the WeakMap AuthContext when present", async () => {
      const { manager, gatewayAdapter } = makeHarness();
      await initAndFlush(manager);

      const [, , contextFactory] =
        gatewayAdapter.createSupergraphHandler.mock.calls[0];

      const req = new Request("http://localhost/graphql");
      // Simulate the auth middleware having run and set context for this request
      const mockService = {
        authenticateRequest: vi.fn().mockResolvedValue({
          user: {
            address: "0xabc",
            chainId: 1,
            networkId: "eip155",
            appKey: "did:key:zAppTest",
          },
          admins: ["0xadmin"],
          auth_enabled: true,
        } satisfies AuthContext),
      } as unknown as AuthService;
      const middleware = createAuthFetchMiddleware(mockService);
      await middleware(() => Promise.resolve(new Response("ok")))(req);

      const ctx = await contextFactory(req);

      expect(ctx.user).toEqual({
        address: "0xabc",
        chainId: 1,
        networkId: "eip155",
        appKey: "did:key:zAppTest",
      });
    });

    it("auth-derived user wins over additionalContextFields with the same key", async () => {
      const { manager, gatewayAdapter } = makeHarness();
      // Deliberately set conflicting keys via setAdditionalContextFields
      manager.setAdditionalContextFields({
        user: { address: "0xoverridden" },
      });
      await initAndFlush(manager);

      const [, , contextFactory] =
        gatewayAdapter.createSupergraphHandler.mock.calls[0];

      const req = new Request("http://localhost/graphql");
      const expectedUser = {
        address: "0xreal",
        chainId: 1,
        networkId: "eip155",
        appKey: "did:key:zAppTest",
      };
      const mockService = {
        authenticateRequest: vi.fn().mockResolvedValue({
          user: expectedUser,
          admins: ["0xadmin"],
          auth_enabled: true,
        } satisfies AuthContext),
      } as unknown as AuthService;
      await createAuthFetchMiddleware(mockService)(() =>
        Promise.resolve(new Response("ok")),
      )(req);

      const ctx = await contextFactory(req);

      // The auth-derived user should win over the one set via setAdditionalContextFields
      expect(ctx.user).toEqual(expectedUser);
    });

    it("an additional field named user never becomes the caller of an anonymous WebSocket", async () => {
      const { manager, gatewayAdapter } = makeHarness();
      manager.setAdditionalContextFields({
        user: { address: "0xinjected" },
        customField: "custom-value",
      });
      await registerSubscriptionSubgraph(manager);
      await initAndFlush(manager);

      const handlers = gatewayAdapter.attachWebSocket.mock
        .calls[0][2] as WsHandlers<Context>;
      const connection = {} as WsConnection;
      await expect(handlers.onConnect({}, connection)).resolves.toBe(true);
      const ctx = (await handlers.context({}, connection)) as Record<
        string,
        unknown
      >;

      expect(ctx["customField"]).toBe("custom-value");
      expect(ctx.user).toBeUndefined();
    });
  });

  // ── SSE handler ────────────────────────────────────────────────────────────

  /**
   * Register a minimal subscription-enabled subgraph on the manager.
   * Required because #setupSupergraphSSE only mounts the SSE handler when
   * at least one subgraph declares hasSubscriptions = true.
   */
  async function registerSubscriptionSubgraph(manager: GraphQLManager) {
    const { gql } = await import("graphql-tag");
    await manager.registerSubgraphInstance(
      {
        name: "test-subscription-sub",
        hasSubscriptions: true,
        typeDefs: gql`
          type Query {
            _placeholder: Boolean
          }
          type Subscription {
            ping: String
          }
        `,
        resolvers: {
          Subscription: {
            ping: {
              subscribe: async function* () {
                await Promise.resolve();
                yield { ping: "pong" };
              },
              resolve: (v: unknown) => (v as { ping: string }).ping,
            },
          },
        },
        relationalDb: {} as IRelationalDb,
        reactorClient: {} as IReactorClient,
      },
      "graphql",
    );
  }

  describe("SSE handler", () => {
    it("mounts the SSE handler at {basePath}/graphql/stream", async () => {
      const { manager, httpAdapter } = makeHarness({ path: "/" });
      await registerSubscriptionSubgraph(manager);
      await initAndFlush(manager);

      expect(httpAdapter.mount).toHaveBeenCalledWith(
        "/graphql/stream",
        expect.any(Function),
        { exact: true },
      );
    });

    it("respects a non-root base path for the SSE mount", async () => {
      const { manager, httpAdapter } = makeHarness({ path: "/api/v1" });
      await registerSubscriptionSubgraph(manager);
      await initAndFlush(manager);

      expect(httpAdapter.mount).toHaveBeenCalledWith(
        "/api/v1/graphql/stream",
        expect.any(Function),
        { exact: true },
      );
    });

    it("wraps the SSE handler through auth middleware", async () => {
      const { manager, mounts } = makeHarness();
      await registerSubscriptionSubgraph(manager);

      const intercepted: globalThis.Request[] = [];
      const authMiddleware =
        (next: FetchHandler): FetchHandler =>
        async (req: Request) => {
          intercepted.push(req);
          return next(req);
        };

      const initPromise = manager.init([], authMiddleware);
      await vi.runAllTimersAsync();
      await initPromise;

      const handler = mounts.get("/graphql/stream");
      expect(handler).toBeDefined();
      const req = new Request("http://localhost/graphql/stream");
      await handler!(req);

      expect(intercepted).toContain(req);
    });

    it("keeps each subscription subgraph's SSE route beside the supergraph's", async () => {
      const { manager, handles, disposed } = makeHarness();
      await registerSubscriptionSubgraph(manager);
      await initAndFlush(manager);

      const subgraphRoute = handles.get(
        "/graphql/test-subscription-sub/stream",
      );
      const supergraphRoute = handles.get("/graphql/stream");
      expect(subgraphRoute).toBeDefined();
      expect(supergraphRoute).toBeDefined();
      expect(disposed).not.toContain(subgraphRoute);
      expect(disposed).not.toContain(supergraphRoute);
    });

    it("unmounts a removed subgraph's SSE route", async () => {
      const { manager, handles, disposed } = makeHarness();
      const { gql } = await import("graphql-tag");
      class PackagedSubscriptions {
        name = "packaged-subs";
        hasSubscriptions = true;
        typeDefs = gql`
          type Query {
            _placeholder: Boolean
          }
          type Subscription {
            ping: String
          }
        `;
        resolvers = {
          Subscription: {
            ping: {
              subscribe: async function* () {
                await Promise.resolve();
                yield { ping: "pong" };
              },
            },
          },
        };
        relationalDb = {} as IRelationalDb;
        reactorClient = {} as IReactorClient;
      }
      await manager.registerSubgraph(
        PackagedSubscriptions as unknown as SubgraphClass,
        "graphql",
        false,
        "pkg",
      );
      await initAndFlush(manager);
      const route = handles.get("/graphql/packaged-subs/stream");
      expect(route).toBeDefined();

      const unregistering = manager.unregisterPackage("pkg");
      await vi.runAllTimersAsync();
      await unregistering;

      expect(disposed).toContain(route);
    });

    it("does not wrap the SSE handler when no authMiddleware is provided", async () => {
      const { manager, mounts } = makeHarness();
      await registerSubscriptionSubgraph(manager);
      await initAndFlush(manager);

      const handler = mounts.get("/graphql/stream");
      expect(handler).toBeDefined();
      // Handler should be callable and return a response without wrapping
      const res = await handler!(
        new Request("http://localhost/graphql/stream"),
      );
      expect(res).toBeInstanceOf(Response);
    });
  });

  // ── authMiddleware wrapping ─────────────────────────────────────────────────

  describe("init() with authMiddleware", () => {
    it("wraps the supergraph handler through the auth middleware", async () => {
      const { manager, gatewayAdapter, mounts } = makeHarness();

      const intercepted: globalThis.Request[] = [];
      const authMiddleware =
        (next: FetchHandler): FetchHandler =>
        async (req: Request) => {
          intercepted.push(req);
          return next(req);
        };

      const initPromise = manager.init([], authMiddleware);
      await vi.runAllTimersAsync();
      await initPromise;

      // Invoke the mounted supergraph handler
      const handler = mounts.get("/graphql");
      expect(handler).toBeDefined();
      const req = new Request("http://localhost/graphql");
      await handler!(req);

      // The auth middleware should have intercepted the call
      expect(intercepted).toContain(req);
      // And the gateway adapter's handler should still have been called
      expect(
        gatewayAdapter.createSupergraphHandler.mock.results[0]
          .value as Promise<FetchHandler>,
      ).toBeDefined();
    });

    it("does not wrap handlers when no authMiddleware is provided", async () => {
      const { manager, mounts } = makeHarness();
      await initAndFlush(manager);

      // The handler should be mounted and callable without going through any wrapper
      const handler = mounts.get("/graphql");
      expect(handler).toBeDefined();
      const res = await handler!(new Request("http://localhost/graphql"));
      expect(res.status).toBe(200);
    });
  });

  // ── requireAuthMiddleware wrapping ────────────────────────────────────────

  describe("init() with requireAuthMiddleware", () => {
    function makeAuthServiceWith(user: AuthContext["user"]): AuthService {
      return {
        authenticateRequest: vi.fn().mockResolvedValue({
          user,
          admins: [],
          auth_enabled: false,
        }),
      } as unknown as AuthService;
    }

    function graphqlRequest(
      init?: RequestInit,
      url = "http://localhost/graphql",
    ): Request {
      return new Request(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: "{ r { version } }" }),
        ...init,
      });
    }

    it("rejects an anonymous caller on the mounted supergraph handler with a 401", async () => {
      const { manager, mounts } = makeHarness();
      await initAndFlush(
        manager,
        [],
        createAuthFetchMiddleware(makeAuthServiceWith(undefined)),
        createRequireAuthFetchMiddleware(),
      );
      const handler = mounts.get("/graphql");
      expect(handler).toBeDefined();

      const res = await handler!(graphqlRequest());

      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({
        error: "Authentication required",
      });
    });

    it("admits an authenticated caller to the mounted supergraph handler", async () => {
      const { manager, mounts } = makeHarness();
      await initAndFlush(
        manager,
        [],
        createAuthFetchMiddleware(
          makeAuthServiceWith({
            address: "0xuser",
            chainId: 1,
            networkId: "mainnet",
            appKey: "did:key:zuser",
          }),
        ),
        createRequireAuthFetchMiddleware(),
      );
      const handler = mounts.get("/graphql");
      expect(handler).toBeDefined();

      const res = await handler!(graphqlRequest());

      expect(res.status).toBe(200);
    });

    it("rejects an anonymous caller with a 401 before shard validation (not a 421)", async () => {
      const { manager, mounts } = makeHarness();
      await initAndFlush(
        manager,
        [],
        createAuthFetchMiddleware(makeAuthServiceWith(undefined)),
        createRequireAuthFetchMiddleware(),
      );
      const handler = mounts.get("/graphql");
      expect(handler).toBeDefined();

      // The drive is not in the ownership cache, so without the
      // require-authenticated-caller middleware the drive middleware would
      // answer 421. It must not get that far.
      const res = await handler!(
        graphqlRequest({
          headers: {
            "content-type": "application/json",
            "drive-id": "drive-not-here",
          },
          body: JSON.stringify({ operationName: "someOperation" }),
        }),
      );

      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({
        error: "Authentication required",
      });
    });

    it("lets OPTIONS preflights through to the handler", async () => {
      const { manager, mounts } = makeHarness();
      await initAndFlush(
        manager,
        [],
        createAuthFetchMiddleware(makeAuthServiceWith(undefined)),
        createRequireAuthFetchMiddleware(),
      );
      const handler = mounts.get("/graphql");
      expect(handler).toBeDefined();

      const res = await handler!(
        new Request("http://localhost/graphql", { method: "OPTIONS" }),
      );

      expect(res.status).toBe(200);
    });

    it("leaves anonymous callers admitted when the middleware is not passed", async () => {
      const { manager, mounts } = makeHarness();
      await initAndFlush(
        manager,
        [],
        createAuthFetchMiddleware(makeAuthServiceWith(undefined)),
      );
      const handler = mounts.get("/graphql");
      expect(handler).toBeDefined();

      const res = await handler!(graphqlRequest());

      expect(res.status).toBe(200);
    });
  });

  // ── additional context fields ──────────────────────────────────────────────

  describe("setAdditionalContextFields / getAdditionalContextFields", () => {
    it("stores and returns the fields", () => {
      const { manager } = makeHarness();
      manager.setAdditionalContextFields({ foo: "bar" });
      expect(manager.getAdditionalContextFields()).toEqual({ foo: "bar" });
    });

    it("merges multiple calls", () => {
      const { manager } = makeHarness();
      manager.setAdditionalContextFields({ foo: "bar" });
      manager.setAdditionalContextFields({ baz: 42 });
      expect(manager.getAdditionalContextFields()).toEqual({
        foo: "bar",
        baz: 42,
      });
    });

    it("later values overwrite earlier ones for the same key", () => {
      const { manager } = makeHarness();
      manager.setAdditionalContextFields({ foo: "first" });
      manager.setAdditionalContextFields({ foo: "second" });
      expect(manager.getAdditionalContextFields().foo).toBe("second");
    });
  });

  // ── getBasePath() ──────────────────────────────────────────────────────────

  describe("getBasePath()", () => {
    it("returns the configured path", () => {
      const { manager } = makeHarness({ path: "/my/base" });
      expect(manager.getBasePath()).toBe("/my/base");
    });
  });

  // ── subgraph deduplication / replacement ───────────────────────────────────

  describe("subgraph deduplication and replacement", () => {
    async function makeSub(name: string, overrides: object = {}) {
      return {
        name,
        typeDefs: (await import("graphql-tag")).gql`type Query { hi: String }`,
        resolvers: {},
        relationalDb: {} as IRelationalDb,
        reactorClient: {} as IReactorClient,
        ...overrides,
      };
    }

    it("re-registering the identical instance is a no-op (no onDisconnect, one onSetup)", async () => {
      const { manager } = makeHarness();
      const onSetup = vi.fn().mockResolvedValue(undefined);
      const onDisconnect = vi.fn().mockResolvedValue(undefined);

      const sub = await makeSub("unique-sub", { onSetup, onDisconnect });

      const first = await manager.registerSubgraphInstance(sub, "graphql");
      const second = await manager.registerSubgraphInstance(sub, "graphql");

      expect(first).toBe(sub);
      expect(second).toBe(sub);
      expect(onSetup).toHaveBeenCalledTimes(1);
      expect(onDisconnect).not.toHaveBeenCalled();
    });

    it("a same-name different instance replaces the old one, disconnecting it", async () => {
      const { manager } = makeHarness();
      const oldOnDisconnect = vi.fn().mockResolvedValue(undefined);
      const newOnSetup = vi.fn().mockResolvedValue(undefined);

      const oldSub = await makeSub("my-sub", { onDisconnect: oldOnDisconnect });
      const newSub = await makeSub("my-sub", { onSetup: newOnSetup });

      await manager.registerSubgraphInstance(oldSub, "graphql");
      const result = await manager.registerSubgraphInstance(newSub, "graphql");

      expect(result).toBe(newSub);
      expect(oldOnDisconnect).toHaveBeenCalledTimes(1);
      expect(newOnSetup).toHaveBeenCalledTimes(1);
      expect(manager.getSubgraphByName("my-sub")).toBe(newSub);
    });

    it("a throwing onDisconnect does not abort the replacement", async () => {
      const { manager } = makeHarness();
      const oldSub = await makeSub("my-sub", {
        onDisconnect: vi.fn().mockRejectedValue(new Error("boom")),
      });
      const newSub = await makeSub("my-sub");

      await manager.registerSubgraphInstance(oldSub, "graphql");
      const result = await manager.registerSubgraphInstance(newSub, "graphql");

      expect(result).toBe(newSub);
      expect(manager.getSubgraphByName("my-sub")).toBe(newSub);
    });

    it("a throwing WebSocket disposer does not abort the replacement", async () => {
      const { manager, gatewayAdapter } = makeHarness();
      const dispose = vi.fn().mockRejectedValue(new Error("ws boom"));
      gatewayAdapter.attachWebSocket.mockReturnValue({ dispose });

      const oldSub = await makeSub("ws-sub", { hasSubscriptions: true });
      await manager.registerSubgraphInstance(oldSub, "graphql");
      await initAndFlush(manager);
      expect(gatewayAdapter.attachWebSocket).toHaveBeenCalledTimes(1);

      const newSub = await makeSub("ws-sub", { hasSubscriptions: true });
      const result = await manager.registerSubgraphInstance(newSub, "graphql");

      expect(dispose).toHaveBeenCalledTimes(1);
      expect(result).toBe(newSub);
      expect(manager.getSubgraphByName("ws-sub")).toBe(newSub);
    });

    it("replacement invalidates the handler cache so the handler is rebuilt", async () => {
      const { manager, gatewayAdapter } = makeHarness();

      const oldSub = await makeSub("my-sub");
      await manager.registerSubgraphInstance(oldSub, "graphql");
      await initAndFlush(manager);

      // One handler built for the subgraph's path on first setup.
      expect(gatewayAdapter.createHandler).toHaveBeenCalledTimes(1);

      // Re-running the router without a replacement reuses the cached handler.
      const noopUpdate = manager.updateRouter();
      await vi.runAllTimersAsync();
      await noopUpdate;
      expect(gatewayAdapter.createHandler).toHaveBeenCalledTimes(1);

      const newSub = await makeSub("my-sub");
      await manager.registerSubgraphInstance(newSub, "graphql");
      const update = manager.updateRouter();
      await vi.runAllTimersAsync();
      await update;

      expect(gatewayAdapter.createHandler).toHaveBeenCalledTimes(2);
    });
  });

  // ── in-process subgraph queries ────────────────────────────────────────────

  describe("executeSubgraphQuery", () => {
    const ECHO_QUERY = "query Echo($input: String!) { echo(input: $input) }";

    // Register a subgraph, then have the gateway answer its requests with
    // `respond`, mirroring the JSON body a real subgraph handler returns.
    async function makeSubgraphHarness(
      respond: (body: {
        query: string;
        variables: Record<string, unknown>;
      }) => Response,
    ) {
      const harness = makeHarness();
      const { gql } = await import("graphql-tag");
      await harness.manager.registerSubgraphInstance(
        {
          name: "echo",
          typeDefs: gql`
            type Query {
              echo(input: String!): String
            }
          `,
          resolvers: {},
          relationalDb: {} as IRelationalDb,
          reactorClient: {} as IReactorClient,
        },
        "graphql",
      );
      const requests: Request[] = [];
      harness.gatewayAdapter.createHandler.mockResolvedValue(
        async (request: Request) => {
          requests.push(request.clone());
          return respond(
            (await request.json()) as {
              query: string;
              variables: Record<string, unknown>;
            },
          );
        },
      );
      return { ...harness, requests };
    }

    const jsonOk = (data: unknown) =>
      new Response(JSON.stringify({ data }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    it("returns the data a registered subgraph resolves", async () => {
      const { manager } = await makeSubgraphHarness(({ variables }) =>
        jsonOk({ echo: `got:${(variables as { input: string }).input}` }),
      );
      await initAndFlush(manager);

      const data = await manager.executeSubgraphQuery<{ echo: string }>(
        "echo",
        ECHO_QUERY,
        { input: "hi" },
      );

      expect(data).toEqual({ echo: "got:hi" });
    });

    it("posts the query and variables as JSON", async () => {
      const { manager, requests } = await makeSubgraphHarness(() =>
        jsonOk({ echo: "ok" }),
      );
      await initAndFlush(manager);

      await manager.executeSubgraphQuery("echo", ECHO_QUERY, { input: "hi" });

      expect(requests).toHaveLength(1);
      expect(requests[0].method).toBe("POST");
      expect(requests[0].headers.get("content-type")).toBe("application/json");
      expect(await requests[0].json()).toEqual({
        query: ECHO_QUERY,
        variables: { input: "hi" },
      });
    });

    // The middleware authenticates callers; an internal read has no caller, so
    // it must reach the subgraph handler directly.
    it("bypasses the auth middleware", async () => {
      const { manager } = await makeSubgraphHarness(() =>
        jsonOk({ echo: "x" }),
      );
      const intercepted: Request[] = [];
      const authMiddleware =
        (next: FetchHandler): FetchHandler =>
        (request: Request) => {
          intercepted.push(request);
          return next(request);
        };

      const initPromise = manager.init([], authMiddleware);
      await vi.runAllTimersAsync();
      await initPromise;

      await manager.executeSubgraphQuery("echo", ECHO_QUERY, { input: "hi" });

      expect(intercepted).toHaveLength(0);
    });

    it("finds subgraphs by name", async () => {
      const { manager } = await makeSubgraphHarness(() => jsonOk({}));
      await initAndFlush(manager);

      expect(manager.getSubgraphByName("echo")?.name).toBe("echo");
      expect(manager.getSubgraphByName("nope")).toBeUndefined();
    });

    it("throws when the subgraph is not registered", async () => {
      const { manager } = makeHarness();
      await initAndFlush(manager);

      await expect(
        manager.executeSubgraphQuery("not-installed", ECHO_QUERY, {
          input: "hi",
        }),
      ).rejects.toThrow(/"not-installed" is not registered/);
    });

    it("throws on GraphQL errors instead of returning partial data", async () => {
      const { manager } = await makeSubgraphHarness(
        () =>
          new Response(
            JSON.stringify({ errors: [{ message: "read model down" }] }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
      );
      await initAndFlush(manager);

      await expect(
        manager.executeSubgraphQuery("echo", ECHO_QUERY, { input: "hi" }),
      ).rejects.toThrow(/read model down/);
    });

    it("throws when the subgraph handler fails, keeping the body", async () => {
      const { manager } = await makeSubgraphHarness(
        () => new Response("boom", { status: 500 }),
      );
      await initAndFlush(manager);

      await expect(
        manager.executeSubgraphQuery("echo", ECHO_QUERY, { input: "hi" }),
      ).rejects.toThrow(/query failed: 500 boom/);
    });

    it("targets the subgraph's real mount path", async () => {
      const { manager, requests } = await makeSubgraphHarness(() =>
        jsonOk({ echo: "ok" }),
      );
      await initAndFlush(manager);

      await manager.executeSubgraphQuery("echo", ECHO_QUERY, { input: "hi" });

      expect(new URL(requests[0].url).pathname).toBe("/graphql/echo");
    });

    // A subgraph whose schema fails to build is registered but unreachable;
    // callers gating on availability must see the handler, not the entry.
    it("reports no handler when the schema failed to build", async () => {
      const { manager, gatewayAdapter } = await makeSubgraphHarness(() =>
        jsonOk({}),
      );
      gatewayAdapter.createHandler.mockRejectedValue(new Error("bad schema"));
      await initAndFlush(manager);

      expect(manager.getSubgraphByName("echo")?.name).toBe("echo");
      expect(manager.hasSubgraphHandler("echo")).toBe(false);
      await expect(
        manager.executeSubgraphQuery("echo", ECHO_QUERY, { input: "hi" }),
      ).rejects.toThrow(/registered but has no handler yet/);
    });

    it("reports a handler once the subgraph is set up", async () => {
      const { manager } = await makeSubgraphHarness(() => jsonOk({}));
      await initAndFlush(manager);

      expect(manager.hasSubgraphHandler("echo")).toBe(true);
      expect(manager.hasSubgraphHandler("nope")).toBe(false);
    });
  });

  // ── handler cache ──────────────────────────────────────────────────────────

  describe("subgraph handler cache", () => {
    it("does not recreate handlers for the same subgraph on repeated _updateRouter calls", async () => {
      const { manager, gatewayAdapter } = makeHarness();

      const sub = {
        name: "cached-sub",
        typeDefs: (await import("graphql-tag")).gql`type Query { hi: String }`,
        resolvers: {},
        relationalDb: {} as IRelationalDb,
        reactorClient: {} as IReactorClient,
      };

      await manager.registerSubgraphInstance(sub, "graphql");

      // First updateRouter - should create the handler
      await initAndFlush(manager);
      const firstCallCount = gatewayAdapter.createHandler.mock.calls.length;

      // Second updateRouter - should hit the cache and NOT call createHandler again
      const routerPromise = manager.updateRouter();
      await vi.runAllTimersAsync();
      await routerPromise;

      expect(gatewayAdapter.createHandler.mock.calls.length).toBe(
        firstCallCount,
      );
    });
  });

  // ── shutdown() ─────────────────────────────────────────────────────────────

  describe("shutdown()", () => {
    it("calls gatewayAdapter.stop()", async () => {
      const { manager, gatewayAdapter } = makeHarness();
      await initAndFlush(manager);

      await manager.shutdown();

      expect(gatewayAdapter.stop).toHaveBeenCalledOnce();
    });

    it("closes the WebSocket server", async () => {
      const { manager, wsServer } = makeHarness();
      await initAndFlush(manager);

      await manager.shutdown();

      expect(wsServer.close).toHaveBeenCalledOnce();
    });
  });

  // ── package teardown (issue #2973) ────────────────────────────────────────

  describe("package teardown (issue #2973)", () => {
    /**
     * Build a minimal subgraph class with a spied `onDisconnect` that
     * records the names of instances it was called on.
     */
    function makeSubgraphClass(
      name: string,
      opts: { subscriptions?: boolean } = {},
    ): [typeof BaseSubgraph, string[]] {
      const disconnected: string[] = [];
      const SubgraphClass = class extends BaseSubgraph {
        name = name;
        hasSubscriptions = opts.subscriptions ?? false;
        typeDefs = gql`
          type Query {
            ping: Boolean
          }
        `;
        resolvers = { Query: { ping: () => true } };
        onDisconnect = (): Promise<void> => {
          disconnected.push(name);
          return Promise.resolve();
        };
      };
      return [SubgraphClass, disconnected];
    }

    async function flushRouter(manager: GraphQLManager): Promise<void> {
      const p = manager.updateRouter();
      await vi.runAllTimersAsync();
      await p;
    }

    it("unregisterPackage unmounts routes and removes all subgraph state", async () => {
      const { manager, mounts, handles, disposed, gatewayAdapter } =
        makeHarness();
      await initAndFlush(manager);

      const [Sub, disconnected] = makeSubgraphClass("alpha");
      await manager.registerSubgraph(Sub, "graphql", false, "test-pkg");
      await flushRouter(manager);

      const routePath = "/graphql/alpha";
      expect(mounts.has(routePath)).toBe(true);
      const originalHandle = handles.get(routePath);
      expect(originalHandle).toBeDefined();
      expect(manager.hasSubgraphHandler("alpha")).toBe(true);
      expect(manager.getSubgraphByName("alpha")).toBeDefined();

      const teardown = manager.unregisterPackage("test-pkg");
      await vi.runAllTimersAsync();
      await teardown;

      expect(originalHandle?.dispose).toHaveBeenCalled();
      expect(manager.hasSubgraphHandler("alpha")).toBe(false);
      expect(manager.getSubgraphByName("alpha")).toBeUndefined();
      expect(disconnected).toContain("alpha");
      expect(gatewayAdapter.updateSupergraph).toHaveBeenCalled();
    });

    it("unregisterPackage is a no-op for a package with no subgraphs", async () => {
      const { manager, disposed, gatewayAdapter } = makeHarness();
      await initAndFlush(manager);

      const supergraphCalls = gatewayAdapter.updateSupergraph.mock.calls.length;
      await manager.unregisterPackage("ghost-pkg");

      expect(disposed).toHaveLength(0);
      expect(gatewayAdapter.updateSupergraph.mock.calls.length).toBe(
        supergraphCalls,
      );
    });

    it("prunePackageSubgraphs removes only the dropped subgraphs", async () => {
      const { manager, mounts, handles, disposed } = makeHarness();
      await initAndFlush(manager);

      const [Alpha] = makeSubgraphClass("alpha");
      const [Beta, betaDisconnected] = makeSubgraphClass("beta");
      await manager.registerSubgraph(Alpha, "graphql", false, "test-pkg");
      await manager.registerSubgraph(Beta, "graphql", false, "test-pkg");
      await flushRouter(manager);

      const keepPromise = manager.prunePackageSubgraphs(
        "test-pkg",
        new Set(["alpha"]),
      );
      await vi.runAllTimersAsync();
      await keepPromise;

      expect(disposed).toContain(handles.get("/graphql/beta"));
      expect(manager.hasSubgraphHandler("alpha")).toBe(true);
      expect(manager.hasSubgraphHandler("beta")).toBe(false);
      expect(manager.getSubgraphByName("beta")).toBeUndefined();
      expect(betaDisconnected).toContain("beta");
      // The kept subgraph's route stays mounted.
      expect(mounts.has("/graphql/alpha")).toBe(true);
    });

    it("unmounts the previous route when a subgraph is replaced", async () => {
      const { manager, httpAdapter, handles } = makeHarness();
      await initAndFlush(manager);

      const [V1] = makeSubgraphClass("alpha");
      await manager.registerSubgraph(V1, "graphql", false, "test-pkg");
      await flushRouter(manager);
      const firstHandle = handles.get("/graphql/alpha");
      expect(firstHandle).toBeDefined();

      // Same name, different class: replacement path.
      const [V2] = makeSubgraphClass("alpha");
      await manager.registerSubgraph(V2, "graphql", false, "test-pkg");
      await flushRouter(manager);

      const secondHandle = handles.get("/graphql/alpha");
      expect(secondHandle).toBeDefined();
      expect(secondHandle).not.toBe(firstHandle);
      expect(firstHandle?.dispose).toHaveBeenCalled();
      expect(manager.hasSubgraphHandler("alpha")).toBe(true);
    });

    it("replaces the SSE route on each update and removes it when no subgraph subscribes", async () => {
      const { manager, mounts, handles, disposed } = makeHarness();
      await initAndFlush(manager);

      // No subscription-capable subgraphs: no SSE route after init.
      expect(mounts.has("/graphql/stream")).toBe(false);

      const [Sub] = makeSubgraphClass("alpha", { subscriptions: true });
      await manager.registerSubgraph(Sub, "graphql", false, "test-pkg");
      await flushRouter(manager);
      expect(mounts.has("/graphql/stream")).toBe(true);
      const firstHandle = handles.get("/graphql/stream");
      expect(firstHandle).toBeDefined();

      // A second router update re-creates the SSE handler and must replace
      // the existing route instead of piling another one on top.
      await flushRouter(manager);
      const secondHandle = handles.get("/graphql/stream");
      expect(secondHandle).toBeDefined();
      expect(secondHandle).not.toBe(firstHandle);
      expect(firstHandle?.dispose).toHaveBeenCalled();

      // Tearing the package down removes the last subscription-capable
      // subgraph: the SSE route must be unmounted as well.
      const teardown = manager.unregisterPackage("test-pkg");
      await vi.runAllTimersAsync();
      await teardown;
      expect(secondHandle?.dispose).toHaveBeenCalled();
    });
  });

  // ── document model subgraph pruning (issue #2973) ───────────────────────

  describe("document model subgraph pruning (issue #2973)", () => {
    /**
     * A model that passes hasOperationSchemas so a subgraph is generated.
     * The global state schema must be named `<PascalModelName>State` to
     * match what generateDocumentModelSchema references (see createSchema).
     */
    function makeSubgraphableModel(
      id: string,
      name: string,
      stateType: string,
    ): DocumentModelModule {
      return {
        documentModel: {
          global: {
            id,
            name,
            specifications: [
              {
                version: 1,
                changeLog: [],
                modules: [
                  {
                    name: "Base",
                    operations: [
                      {
                        name: "SET_NAME",
                        schema: "input SetNameInput { name: String }",
                      },
                    ],
                  },
                ],
                state: {
                  global: {
                    schema: `type ${stateType} { name: String }`,
                  },
                  local: { schema: "" },
                },
              },
            ],
          },
        },
        actions: { setName: vi.fn() },
        reducer: vi.fn(),
      } as unknown as DocumentModelModule;
    }

    it("removes the subgraph of a model that disappeared since the last regeneration", async () => {
      const drive = makeDriveModule();
      const alpha = makeSubgraphableModel(
        "powerhouse/alpha",
        "Alpha Model",
        "AlphaModelState",
      );
      const beta = makeSubgraphableModel(
        "powerhouse/beta",
        "Beta Model",
        "BetaModelState",
      );
      const reactorClient = makeMockReactorClient({
        getDocumentModelModules: vi
          .fn()
          .mockResolvedValue({ results: [drive, alpha, beta] }),
      });
      const { manager, mounts, handles, disposed } = makeHarness({
        reactorClient,
        enableDocumentModelSubgraphs: true,
      });
      await initAndFlush(manager);

      // Both model subgraphs are registered and mounted.
      expect(mounts.has("/graphql/alpha-model")).toBe(true);
      expect(mounts.has("/graphql/beta-model")).toBe(true);

      // Beta's package was uninstalled: its model is gone from the source
      // of truth. Regeneration must remove the old subgraph, not just
      // replace the current ones.
      vi.mocked(reactorClient.getDocumentModelModules).mockResolvedValue({
        results: [drive, alpha],
        options: { cursor: "", limit: 100 },
      });
      const regenerate = manager.regenerateDocumentModelSubgraphs();
      await vi.runAllTimersAsync();
      await regenerate;

      expect(disposed).toContain(handles.get("/graphql/beta-model"));
      expect(manager.getSubgraphByName("beta-model")).toBeUndefined();
      expect(manager.hasSubgraphHandler("alpha-model")).toBe(true);
    });
  });

  // ── attachment client provider ───────────────────────────────────────────

  describe("attachment client provider", () => {
    function makeProvider() {
      const client = {} as IAttachmentClient;
      const provider = {
        forSubject: vi.fn(() => client),
      } satisfies IAttachmentClientProvider;
      return { provider, client };
    }

    it("passes the provider to a registered subgraph", async () => {
      const { provider } = makeProvider();
      const { manager } = makeHarness({ attachments: provider });
      await initAndFlush(manager);

      let received: SubgraphArgs | undefined;
      class CapturingSubgraph extends BaseSubgraph {
        name = "capturing";
        constructor(args: SubgraphArgs) {
          super(args);
          received = args;
        }
      }
      await manager.registerSubgraph(CapturingSubgraph, "graphql");

      expect(received?.attachments).toBe(provider);
    });

    it("passes the provider to a document model subgraph", async () => {
      const { provider, client } = makeProvider();
      const { manager } = makeHarness({
        attachments: provider,
        enableDocumentModelSubgraphs: true,
        reactorClient: makeMockReactorClient({
          getDocumentModelModules: vi.fn().mockResolvedValue({
            results: [
              makeDriveModule(),
              makeModelModule("Gadget", "powerhouse/test-gadget"),
            ],
          }),
        }),
      });
      await initAndFlush(manager);

      const subgraph = manager.getSubgraphByName("gadget");
      expect(subgraph).toBeInstanceOf(BaseSubgraph);
      const ctx = { user: { address: "0xabc" } } as Context;
      expect((subgraph as BaseSubgraph).attachmentsFor(ctx)).toBe(client);
      expect(provider.forSubject).toHaveBeenCalledWith({
        address: "0xabc",
        key: undefined,
      });
    });
  });

  // ── mount path & name ownership (issue #2972) ─────────────────────────────

  describe("mount path & name ownership (issue #2972)", () => {
    // A package subgraph trying to choose its own mount point: the field
    // initializers run after super() and overwrite the host-injected `path`.
    class EvilSubgraph extends BaseSubgraph {
      name = "evil";
      path = "/";
    }

    it("mounts under the manager's base path even when the subgraph's `path` initializer overwrote the injected value", async () => {
      const { manager, httpAdapter } = makeHarness({ path: "/ph" });
      await initAndFlush(manager);

      const instance = await manager.registerSubgraph(EvilSubgraph, "graphql");
      const update = manager.updateRouter();
      await vi.runAllTimersAsync();
      await update;

      // The initializer really did clobber the injected value - without this
      // the mount assertions below would be vacuous.
      expect(instance?.path).toBe("/");

      expect(httpAdapter.mount).toHaveBeenCalledWith(
        "/ph/graphql/evil",
        expect.any(Function),
      );
      expect(httpAdapter.mount).not.toHaveBeenCalledWith(
        "/graphql/evil",
        expect.any(Function),
      );
    });

    it("ignores a plain-object subgraph's `path` for routing", async () => {
      const { manager, httpAdapter } = makeHarness({ path: "/ph" });
      await initAndFlush(manager);

      await manager.registerSubgraphInstance(
        {
          name: "mcp-sub",
          path: "/mcp",
          typeDefs: gql`
            type Query {
              hi: String
            }
          `,
          resolvers: {},
          relationalDb: {} as IRelationalDb,
          reactorClient: {} as IReactorClient,
        },
        "graphql",
      );
      const update = manager.updateRouter();
      await vi.runAllTimersAsync();
      await update;

      expect(httpAdapter.mount).toHaveBeenCalledWith(
        "/ph/graphql/mcp-sub",
        expect.any(Function),
      );
      expect(httpAdapter.mount).not.toHaveBeenCalledWith(
        "/mcp/graphql/mcp-sub",
        expect.any(Function),
      );
    });

    function makePlainSub(name: string, overrides: object = {}) {
      return {
        name,
        typeDefs: gql`
          type Query {
            hi: String
          }
        `,
        resolvers: {},
        relationalDb: {} as IRelationalDb,
        reactorClient: {} as IReactorClient,
        ...overrides,
      };
    }

    // A core subgraph named "system" - the default BaseSubgraph name is
    // "example", so a subgraph named "system" is a deliberate collision.
    class SystemSubgraph extends BaseSubgraph {
      name = "system";
    }

    it("rejects a non-core subgraph that takes a registered core subgraph's name", async () => {
      const logger = makeHarnessLogger();
      const { manager } = makeHarness({ logger });
      await initAndFlush(manager, [SystemSubgraph]);

      const core = manager.getSubgraphByName("system");
      expect(core).toBeDefined();

      const result = await manager.registerSubgraphInstance(
        makePlainSub("system"),
        "graphql",
      );

      expect(result).toBeUndefined();
      expect(manager.getSubgraphByName("system")).toBe(core);
      expect(logger.error).toHaveBeenCalledWith(
        "Rejecting subgraph @name: name is reserved by a registered core subgraph",
        "system",
      );

      // The same rejection applies with the default supergraph.
      const resultWithDefaultSupergraph =
        await manager.registerSubgraphInstance(makePlainSub("system"));
      expect(resultWithDefaultSupergraph).toBeUndefined();
      expect(manager.getSubgraphByName("system")).toBe(core);
    });

    it("setSupergraph drops subgraphs that take a registered core subgraph's name", async () => {
      const logger = makeHarnessLogger();
      const { manager } = makeHarness({ logger });
      await initAndFlush(manager, [SystemSubgraph]);

      const core = manager.getSubgraphByName("system");
      expect(core).toBeDefined();

      const good = makePlainSub("good");
      const evil = makePlainSub("system");

      const update = manager.setSupergraph("graphql", [good, evil]);
      await vi.runAllTimersAsync();
      await update;

      expect(logger.error).toHaveBeenCalledWith(
        "Rejecting subgraph @name: name is reserved by a registered core subgraph",
        "system",
      );
      expect(manager.getSubgraphByName("system")).toBe(core);
      expect(manager.getSubgraphByName("good")).toBe(good);

      // Whitebox: `subgraphs` is the manager's private bucket map; reach it
      // to assert the rejected instance was never written into one.
      const managerWithBuckets = manager as unknown as {
        subgraphs: Map<string, ISubgraph[]>;
      };
      const buckets = managerWithBuckets.subgraphs;
      for (const subgraphs of buckets.values()) {
        expect(subgraphs).not.toContain(evil);
      }
      expect(buckets.get("graphql")).toContain(good);
    });

    it("rejects a document model subgraph whose kebab-cased name collides with a core subgraph", async () => {
      const logger = makeHarnessLogger();
      const systemModel = makeModelModule(
        "System",
        "powerhouse/test-system-model",
      );
      const { manager } = makeHarness({
        logger,
        enableDocumentModelSubgraphs: true,
        reactorClient: makeMockReactorClient({
          getDocumentModelModules: vi.fn().mockResolvedValue({
            results: [makeDriveModule(), systemModel],
          }),
        }),
      });

      await initAndFlush(manager, [SystemSubgraph]);

      const core = manager.getSubgraphByName("system");
      expect(core).toBeDefined();
      expect(logger.error).toHaveBeenCalledWith(
        "Rejecting subgraph @name: name is reserved by a registered core subgraph",
        "system",
      );
      expect(manager.getSubgraphByName("system")).toBe(core);
    });

    it("a core subgraph evicts a same-named subgraph registered before init", async () => {
      const logger = makeHarnessLogger();
      const { manager, gatewayAdapter } = makeHarness({ logger });
      const plain = makePlainSub("early");
      await manager.registerSubgraphInstance(plain, "graphql");

      class CoreSubgraph extends BaseSubgraph {
        name = "early";
      }
      await initAndFlush(manager, [CoreSubgraph]);

      expect(manager.getSubgraphByName("early")).toBeInstanceOf(CoreSubgraph);
      const { subgraphs } = manager as unknown as {
        subgraphs: Map<string, ISubgraph[]>;
      };
      for (const bucket of subgraphs.values()) {
        expect(bucket).not.toContain(plain);
      }
      expect(manager.hasSubgraphHandler("early")).toBe(true);
      const getDefinitions = gatewayAdapter.createSupergraphHandler.mock
        .calls[0][0] as () => { name: string; typeDefs: DocumentNode }[];
      const served = getDefinitions().find((d) => d.name === ":graphql/early");
      const queryFields = served!.typeDefs.definitions.flatMap((def) =>
        (def.kind === Kind.OBJECT_TYPE_DEFINITION ||
          def.kind === Kind.OBJECT_TYPE_EXTENSION) &&
        def.name.value === "Query"
          ? (def.fields ?? []).map((field) => field.name.value)
          : [],
      );
      // The core subgraph's `Query.hello`, not the plain one's `Query.hi`.
      expect(queryFields).toContain("hello");
      expect(queryFields).not.toContain("hi");
      expect(logger.error).toHaveBeenCalledWith(
        "Evicting subgraph @name from @existing: @origin outranks it",
        "early",
        "the host",
        "core",
      );
    });

    class LateCore extends BaseSubgraph {
      name = "late";
    }

    async function registerLateCore(manager: GraphQLManager) {
      const core = await manager.registerSubgraph(LateCore, "graphql", true);
      const update = manager.updateRouter();
      await vi.runAllTimersAsync();
      await update;
      return core;
    }

    it("mounts a core subgraph registered after init", async () => {
      const { manager, handles } = makeHarness();
      await initAndFlush(manager);

      await registerLateCore(manager);

      expect(manager.hasSubgraphHandler("late")).toBe(true);
      expect(handles.get("/graphql/late")).toBeDefined();
    });

    it("a core subgraph registered after init evicts a same-named subgraph", async () => {
      const logger = makeHarnessLogger();
      const { manager } = makeHarness({ logger });
      await initAndFlush(manager);
      const plain = makePlainSub("late");
      await manager.registerSubgraphInstance(plain, "graphql");

      const core = await registerLateCore(manager);

      expect(manager.getSubgraphByName("late")).toBe(core);
      const { subgraphs } = manager as unknown as {
        subgraphs: Map<string, ISubgraph[]>;
      };
      for (const bucket of subgraphs.values()) {
        expect(bucket).not.toContain(plain);
      }
      expect(logger.error).toHaveBeenCalledWith(
        "Evicting subgraph @name from @existing: @origin outranks it",
        "late",
        "the host",
        "core",
      );
    });
  });

  // ── same-name subgraphs of different origin ────────────────────────────────

  describe("same-name subgraphs of different origin", () => {
    const reactorDriveModel =
      reactorDriveDocumentModelModule as unknown as DocumentModelModule;

    /** The name the generated subgraph for the ReactorDrive model takes. */
    const reactorDriveModelSubgraphName = new DocumentModelSubgraph(
      reactorDriveModel,
      { reactorClient: {} as IReactorClient } as SubgraphArgs,
    ).name;

    /** The reactor-drive listing subgraph as switchboard registers it. */
    function makeHostReactorDriveSubgraph(
      name = REACTOR_DRIVE_SUBGRAPH_NAME,
    ): ISubgraph {
      return {
        name,
        path: "/",
        resolvers: createReactorDriveResolvers({
          hostCanRead: () => Promise.resolve(true),
        }),
        typeDefs: reactorDriveSubgraphTypeDefs,
        reactorClient: {} as IReactorClient,
        relationalDb: undefined as never,
      };
    }

    function makeWidgetSubgraph(name = "widget-stock"): ISubgraph {
      return {
        name,
        typeDefs: gql`
          type Widget {
            inventory: Int!
          }
          type Query {
            widgetStock: Widget
          }
        `,
        resolvers: {},
        relationalDb: {} as IRelationalDb,
        reactorClient: {} as IReactorClient,
      };
    }

    async function flush<T>(pending: Promise<T>): Promise<T> {
      await vi.runAllTimersAsync();
      return pending;
    }

    function supergraphDefinitions(
      gatewayAdapter: ReturnType<typeof makeHarness>["gatewayAdapter"],
    ): { name: string; typeDefs: DocumentNode }[] {
      const getDefinitions = gatewayAdapter.createSupergraphHandler.mock
        .calls[0][0] as () => { name: string; typeDefs: DocumentNode }[];
      return getDefinitions();
    }

    /** Field names of `typeName` across every subgraph the supergraph serves. */
    function servedFields(
      gatewayAdapter: ReturnType<typeof makeHarness>["gatewayAdapter"],
      typeName: string,
    ): string[] {
      const fields: string[] = [];
      for (const { typeDefs } of supergraphDefinitions(gatewayAdapter)) {
        for (const def of typeDefs.definitions) {
          if (
            (def.kind === Kind.OBJECT_TYPE_DEFINITION ||
              def.kind === Kind.OBJECT_TYPE_EXTENSION) &&
            def.name.value === typeName
          ) {
            fields.push(...(def.fields ?? []).map((f) => f.name.value));
          }
        }
      }
      return fields;
    }

    function expectListingServed(
      gatewayAdapter: ReturnType<typeof makeHarness>["gatewayAdapter"],
    ) {
      expect(servedFields(gatewayAdapter, "Query")).toContain("reactorDrive");
      expect(servedFields(gatewayAdapter, "ReactorDriveInfo")).toContain(
        "rootNodes",
      );
    }

    function expectDocumentMutationsServed(
      gatewayAdapter: ReturnType<typeof makeHarness>["gatewayAdapter"],
    ) {
      expect(servedFields(gatewayAdapter, "Mutation")).toContain(
        "ReactorDrive",
      );
      expect(servedFields(gatewayAdapter, "ReactorDriveMutations")).toEqual(
        expect.arrayContaining(["addFolder", "setDriveName"]),
      );
    }

    function makeModelsClient(models: DocumentModelModule[]) {
      return makeMockReactorClient({
        getDocumentModelModules: vi.fn().mockResolvedValue({ results: models }),
      });
    }

    const ORIGIN_REJECTION =
      "Rejecting subgraph @name from @origin: name is taken by a subgraph from @existing";
    const EVICTION =
      "Evicting subgraph @name from @existing: @origin outranks it";

    it("serves the listing beside the ReactorDrive document mutations", async () => {
      const { manager, gatewayAdapter } = makeHarness({
        reactorClient: makeModelsClient([makeDriveModule(), reactorDriveModel]),
        enableDocumentModelSubgraphs: true,
      });
      await initAndFlush(manager);
      expect(
        manager.getSubgraphByName(reactorDriveModelSubgraphName),
      ).toBeInstanceOf(DocumentModelSubgraph);

      await manager.registerSubgraphInstance(
        makeHostReactorDriveSubgraph(),
        "graphql",
        false,
      );
      await flush(manager.updateRouter());

      expectListingServed(gatewayAdapter);
      expectDocumentMutationsServed(gatewayAdapter);
    });

    it("keeps both when document-model subgraphs regenerate", async () => {
      const { manager, gatewayAdapter } = makeHarness({
        reactorClient: makeModelsClient([makeDriveModule(), reactorDriveModel]),
        enableDocumentModelSubgraphs: true,
      });
      await initAndFlush(manager);
      await manager.registerSubgraphInstance(
        makeHostReactorDriveSubgraph(),
        "graphql",
        false,
      );
      await flush(manager.updateRouter());

      // As a package install does.
      await flush(manager.regenerateDocumentModelSubgraphs());

      expectListingServed(gatewayAdapter);
      expectDocumentMutationsServed(gatewayAdapter);
    });

    it("keeps both when the ReactorDrive model arrives later", async () => {
      const reactorClient = makeModelsClient([makeDriveModule()]);
      const { manager, gatewayAdapter } = makeHarness({
        reactorClient,
        enableDocumentModelSubgraphs: true,
      });
      await initAndFlush(manager);
      await manager.registerSubgraphInstance(
        makeHostReactorDriveSubgraph(),
        "graphql",
        false,
      );
      await flush(manager.updateRouter());
      expectListingServed(gatewayAdapter);

      vi.mocked(reactorClient.getDocumentModelModules).mockResolvedValue({
        results: [makeDriveModule(), reactorDriveModel],
        options: { cursor: "", limit: 100 },
      });
      await flush(manager.regenerateDocumentModelSubgraphs());

      expectListingServed(gatewayAdapter);
      expectDocumentMutationsServed(gatewayAdapter);
    });

    it("a host subgraph evicts a boot model's subgraph of its name", async () => {
      const logger = makeHarnessLogger();
      const { manager, gatewayAdapter } = makeHarness({
        logger,
        reactorClient: makeModelsClient([makeDriveModule(), reactorDriveModel]),
        enableDocumentModelSubgraphs: true,
      });
      await initAndFlush(manager);

      const host = makeHostReactorDriveSubgraph(reactorDriveModelSubgraphName);
      const result = await manager.registerSubgraphInstance(
        host,
        "graphql",
        false,
      );
      await flush(manager.updateRouter());

      expect(result).toBe(host);
      expect(logger.error).toHaveBeenCalledWith(
        EVICTION,
        reactorDriveModelSubgraphName,
        "document models",
        "the host",
      );
      expect(manager.getSubgraphByName(reactorDriveModelSubgraphName)).toBe(
        host,
      );
      expectListingServed(gatewayAdapter);
      expect(servedFields(gatewayAdapter, "Mutation")).not.toContain(
        "ReactorDrive",
      );

      // The model does not take it back when its subgraphs regenerate.
      await flush(manager.regenerateDocumentModelSubgraphs());
      expect(manager.getSubgraphByName(reactorDriveModelSubgraphName)).toBe(
        host,
      );
      expect(logger.error).toHaveBeenCalledWith(
        ORIGIN_REJECTION,
        reactorDriveModelSubgraphName,
        "document models",
        "the host",
      );
    });

    it("a host subgraph evicts a package subgraph of its name", async () => {
      const logger = makeHarnessLogger();
      const { manager } = makeHarness({ logger });
      await initAndFlush(manager);
      class Privacy extends BaseSubgraph {
        name = "privacy";
      }
      await manager.applyPackageSubgraphs(new Map([["pkg", [Privacy]]]));

      const host = makeWidgetSubgraph("privacy");
      expect(await manager.registerSubgraphInstance(host, "graphql")).toBe(
        host,
      );
      await flush(manager.updateRouter());

      expect(manager.getSubgraphByName("privacy")).toBe(host);
      expect(manager.hasSubgraphHandler("privacy")).toBe(true);
      expect(logger.error).toHaveBeenCalledWith(
        EVICTION,
        "privacy",
        "package pkg",
        "the host",
      );

      // The package's next change is refused.
      await manager.applyPackageSubgraphs(new Map([["pkg", [Privacy]]]));
      expect(manager.getSubgraphByName("privacy")).toBe(host);
    });

    it("serves a package subgraph a host evicted once the host subgraph goes", async () => {
      const { manager } = makeHarness();
      await initAndFlush(manager);
      class Shared extends BaseSubgraph {
        name = "shared";
      }
      await manager.applyPackageSubgraphs(new Map([["pkg", [Shared]]]));
      const host = makeWidgetSubgraph("shared");
      await flush(manager.setSupergraph("extra", [host]));
      expect(manager.getSubgraphByName("shared")).toBe(host);

      await flush(manager.setSupergraph("extra", []));

      expect(manager.getSubgraphByName("shared")).toBeInstanceOf(Shared);
      expect(manager.hasSubgraphHandler("shared")).toBe(true);
    });

    it("serves a package's refused subgraph once the package holding its name is unregistered", async () => {
      const { manager } = makeHarness();
      await initAndFlush(manager);
      class FooA extends BaseSubgraph {
        name = "foo";
      }
      class FooB extends BaseSubgraph {
        name = "foo";
      }
      await manager.registerSubgraph(FooA, "graphql", false, "a");
      expect(
        await manager.registerSubgraph(FooB, "graphql", false, "b"),
      ).toBeUndefined();

      await flush(manager.unregisterPackage("a"));

      expect(manager.getSubgraphByName("foo")).toBeInstanceOf(FooB);
      expect(manager.hasSubgraphHandler("foo")).toBe(true);
    });

    it("serves a package's refused subgraph once the package holding its name drops it", async () => {
      const { manager } = makeHarness();
      await initAndFlush(manager);
      class FooA extends BaseSubgraph {
        name = "foo";
      }
      class FooB extends BaseSubgraph {
        name = "foo";
      }
      await manager.registerSubgraph(FooA, "graphql", false, "a");
      await manager.registerSubgraph(FooB, "graphql", false, "b");

      await flush(manager.prunePackageSubgraphs("a", new Set()));

      expect(manager.getSubgraphByName("foo")).toBeInstanceOf(FooB);
    });

    it("refuses a document-model subgraph whose name a host subgraph holds", async () => {
      const logger = makeHarnessLogger();
      const reactorClient = makeModelsClient([makeDriveModule()]);
      const { manager, gatewayAdapter } = makeHarness({
        logger,
        reactorClient,
        enableDocumentModelSubgraphs: true,
      });
      await initAndFlush(manager);
      const host = makeHostReactorDriveSubgraph(reactorDriveModelSubgraphName);
      await manager.registerSubgraphInstance(host, "graphql", false);
      await flush(manager.updateRouter());

      vi.mocked(reactorClient.getDocumentModelModules).mockResolvedValue({
        results: [makeDriveModule(), reactorDriveModel],
        options: { cursor: "", limit: 100 },
      });
      await flush(manager.regenerateDocumentModelSubgraphs());
      await flush(manager.regenerateDocumentModelSubgraphs());

      expect(logger.error).toHaveBeenCalledWith(
        ORIGIN_REJECTION,
        reactorDriveModelSubgraphName,
        "document models",
        "the host",
      );
      expect(manager.getSubgraphByName(reactorDriveModelSubgraphName)).toBe(
        host,
      );
      expectListingServed(gatewayAdapter);
    });

    it("a package re-registering its own subgraph name replaces it; another package is refused", async () => {
      const logger = makeHarnessLogger();
      const { manager } = makeHarness({ logger });
      await initAndFlush(manager);

      class V1 extends BaseSubgraph {
        name = "shared-name";
      }
      class V2 extends BaseSubgraph {
        name = "shared-name";
      }
      const first = await manager.registerSubgraph(V1, "graphql", false, "a");
      const second = await manager.registerSubgraph(V2, "graphql", false, "a");
      expect(second).toBeInstanceOf(V2);
      expect(second).not.toBe(first);
      expect(manager.getSubgraphByName("shared-name")).toBe(second);

      const other = await manager.registerSubgraph(V1, "graphql", false, "b");
      expect(other).toBeUndefined();
      expect(manager.getSubgraphByName("shared-name")).toBe(second);
      expect(logger.error).toHaveBeenCalledWith(
        ORIGIN_REJECTION,
        "shared-name",
        "package b",
        "package a",
      );
    });

    it("refuses a package subgraph that takes a document-model subgraph's name", async () => {
      const logger = makeHarnessLogger();
      const { manager } = makeHarness({
        logger,
        reactorClient: makeModelsClient([makeDriveModule(), reactorDriveModel]),
        enableDocumentModelSubgraphs: true,
      });
      await initAndFlush(manager);
      const documentModelSubgraph = manager.getSubgraphByName(
        reactorDriveModelSubgraphName,
      );

      class Squatter extends BaseSubgraph {
        name = reactorDriveModelSubgraphName;
      }
      const result = await manager.registerSubgraph(
        Squatter,
        "graphql",
        false,
        "squatter-pkg",
      );

      expect(result).toBeUndefined();
      expect(logger.error).toHaveBeenCalledWith(
        ORIGIN_REJECTION,
        reactorDriveModelSubgraphName,
        "package squatter-pkg",
        "document models",
      );
      expect(manager.getSubgraphByName(reactorDriveModelSubgraphName)).toBe(
        documentModelSubgraph,
      );
    });

    it("setSupergraph evicts a document-model subgraph of a subgraph's name", async () => {
      const logger = makeHarnessLogger();
      const { manager } = makeHarness({
        logger,
        reactorClient: makeModelsClient([makeDriveModule(), reactorDriveModel]),
        enableDocumentModelSubgraphs: true,
      });
      await initAndFlush(manager);
      const host = makeHostReactorDriveSubgraph(reactorDriveModelSubgraphName);

      await flush(manager.setSupergraph("extra", [host]));

      expect(logger.error).toHaveBeenCalledWith(
        EVICTION,
        reactorDriveModelSubgraphName,
        "document models",
        "the host",
      );
      expect(manager.getSubgraphByName(reactorDriveModelSubgraphName)).toBe(
        host,
      );
      expect(registeredNamed(manager, reactorDriveModelSubgraphName)).toEqual(
        new Set([host]),
      );
    });

    it("refuses a subgraph whose types collide with a loaded document model", async () => {
      const logger = makeHarnessLogger();
      const { manager } = makeHarness({
        logger,
        reactorClient: makeModelsClient([
          makeDriveModule(),
          makeModelModule("Widget", "test/widget"),
        ]),
        enableDocumentModelSubgraphs: true,
      });
      await initAndFlush(manager);

      const result = await manager.registerSubgraphInstance(
        makeWidgetSubgraph(),
        "graphql",
      );

      expect(result).toBeUndefined();
      expect(manager.getSubgraphByName("widget-stock")).toBeUndefined();
      expect(logger.error).toHaveBeenCalledWith(
        "Rejecting subgraph @name: @error",
        "widget-stock",
        expect.stringContaining("Widget"),
      );
    });

    it("unmounts a subgraph a later model collides with, logs once, and remounts it when the model goes", async () => {
      const logger = makeHarnessLogger();
      const reactorClient = makeModelsClient([makeDriveModule()]);
      const { manager, gatewayAdapter, handles } = makeHarness({
        logger,
        reactorClient,
        enableDocumentModelSubgraphs: true,
      });
      await initAndFlush(manager);
      await manager.registerSubgraphInstance(makeWidgetSubgraph(), "graphql");
      await flush(manager.updateRouter());
      expect(servedFields(gatewayAdapter, "Query")).toContain("widgetStock");
      const route = handles.get("/graphql/widget-stock");
      expect(manager.hasSubgraphHandler("widget-stock")).toBe(true);

      vi.mocked(reactorClient.getDocumentModelModules).mockResolvedValue({
        results: [makeDriveModule(), makeModelModule("Widget", "test/widget")],
        options: { cursor: "", limit: 100 },
      });
      await flush(manager.regenerateDocumentModelSubgraphs());
      await flush(manager.updateRouter());

      const names = supergraphDefinitions(gatewayAdapter).map((d) => d.name);
      expect(names).not.toContain(":graphql/widget-stock");
      expect(names).toContain(":graphql/widget");
      expect(route?.dispose).toHaveBeenCalled();
      expect(manager.hasSubgraphHandler("widget-stock")).toBe(false);
      const exclusions = vi
        .mocked(logger.error)
        .mock.calls.filter(
          ([message, name]) =>
            message === "Excluding subgraph @name: @error" &&
            name === "widget-stock",
        );
      expect(exclusions).toHaveLength(1);
      expect(exclusions[0][2]).toContain("Widget");

      vi.mocked(reactorClient.getDocumentModelModules).mockResolvedValue({
        results: [makeDriveModule()],
        options: { cursor: "", limit: 100 },
      });
      await flush(manager.regenerateDocumentModelSubgraphs());

      expect(manager.hasSubgraphHandler("widget-stock")).toBe(true);
      expect(servedFields(gatewayAdapter, "Query")).toContain("widgetStock");
    });

    it("heals a model whose own operation schema repeats its prefixed state type", async () => {
      const logger = makeHarnessLogger();
      const gizmo = makeModelModule("Gizmo", "test/gizmo");
      const spec = gizmo.documentModel.global.specifications[0];
      spec.state.global.schema =
        "type GizmoState { kind: Kind }\nenum Kind { A B }";
      spec.modules[0].operations[0].schema =
        "input DoThingInput { x: String }\nenum Kind { A B }";
      const { manager, gatewayAdapter } = makeHarness({
        logger,
        reactorClient: makeModelsClient([makeDriveModule(), gizmo]),
        enableDocumentModelSubgraphs: true,
      });
      await initAndFlush(manager);

      expect(manager.getSubgraphByName("gizmo")).toBeInstanceOf(
        DocumentModelSubgraph,
      );
      expect(manager.hasSubgraphHandler("gizmo")).toBe(true);
      expect(servedFields(gatewayAdapter, "GizmoMutations")).toContain(
        "doThing",
      );
      expect(logger.error).not.toHaveBeenCalled();
    });

    it("refuses another subgraph that redefines a model's prefixed type", async () => {
      const logger = makeHarnessLogger();
      const { manager } = makeHarness({
        logger,
        reactorClient: makeModelsClient([makeDriveModule(), reactorDriveModel]),
        enableDocumentModelSubgraphs: true,
      });
      await initAndFlush(manager);

      const prefixed = Array.from(
        getGeneratedDocumentModelTypes([reactorDriveModel]).names,
      ).find((name) => name.startsWith("ReactorDrive_"));
      expect(prefixed).toBeDefined();

      const result = await manager.registerSubgraphInstance(
        {
          ...makeWidgetSubgraph("prefixed-squatter"),
          typeDefs: gql(`
            type ${prefixed} {
              squatted: String
            }
            type Query {
              squat: ${prefixed}
            }
          `),
        },
        "graphql",
      );

      expect(result).toBeUndefined();
      expect(logger.error).toHaveBeenCalledWith(
        "Rejecting subgraph @name: @error",
        "prefixed-squatter",
        expect.stringContaining(prefixed!),
      );
    });

    it("hands a name from an uninstalled package to the package installed in the same change", async () => {
      const logger = makeHarnessLogger();
      const { manager } = makeHarness({ logger });
      await initAndFlush(manager);
      class FooA extends BaseSubgraph {
        name = "foo";
      }
      class FooB extends BaseSubgraph {
        name = "foo";
      }

      await manager.applyPackageSubgraphs(new Map([["a", [FooA]]]));
      expect(manager.getSubgraphByName("foo")).toBeInstanceOf(FooA);

      await manager.applyPackageSubgraphs(new Map([["b", [FooB]]]));
      await flush(manager.updateRouter());

      expect(manager.getSubgraphByName("foo")).toBeInstanceOf(FooB);
      expect(manager.hasSubgraphHandler("foo")).toBe(true);
      expect(logger.error).not.toHaveBeenCalled();
    });

    it("hands a name a package drops to another package in the same change, in either order", async () => {
      const logger = makeHarnessLogger();
      const { manager } = makeHarness({ logger });
      await initAndFlush(manager);
      class FooA extends BaseSubgraph {
        name = "foo";
      }
      class BarA extends BaseSubgraph {
        name = "bar";
      }
      class FooB extends BaseSubgraph {
        name = "foo";
      }

      await manager.applyPackageSubgraphs(new Map([["a", [FooA, BarA]]]));
      await manager.applyPackageSubgraphs(
        new Map<string, (typeof BaseSubgraph)[]>([
          ["b", [FooB]],
          ["a", [BarA]],
        ]),
      );

      expect(manager.getSubgraphByName("foo")).toBeInstanceOf(FooB);
      expect(manager.getSubgraphByName("bar")).toBeInstanceOf(BarA);
      expect(logger.error).not.toHaveBeenCalled();
    });

    it("a hot-loaded model takes its subgraph name from a package, as at boot", async () => {
      const logger = makeHarnessLogger();
      const reactorClient = makeModelsClient([makeDriveModule()]);
      const { manager } = makeHarness({
        logger,
        reactorClient,
        enableDocumentModelSubgraphs: true,
      });
      await initAndFlush(manager);
      class Squatter extends BaseSubgraph {
        name = reactorDriveModelSubgraphName;
      }
      await manager.applyPackageSubgraphs(new Map([["pkg", [Squatter]]]));
      expect(
        manager.getSubgraphByName(reactorDriveModelSubgraphName),
      ).toBeInstanceOf(Squatter);

      vi.mocked(reactorClient.getDocumentModelModules).mockResolvedValue({
        results: [makeDriveModule(), reactorDriveModel],
        options: { cursor: "", limit: 100 },
      });
      await flush(manager.regenerateDocumentModelSubgraphs());

      expect(
        manager.getSubgraphByName(reactorDriveModelSubgraphName),
      ).toBeInstanceOf(DocumentModelSubgraph);
      expect(logger.error).toHaveBeenCalledWith(
        EVICTION,
        reactorDriveModelSubgraphName,
        "package pkg",
        "document models",
      );

      // The package's next change is refused, as at boot.
      await manager.applyPackageSubgraphs(new Map([["pkg", [Squatter]]]));
      expect(
        manager.getSubgraphByName(reactorDriveModelSubgraphName),
      ).toBeInstanceOf(DocumentModelSubgraph);
    });

    it("setSupergraph keeps a package's own instance and refuses a type collision", async () => {
      const logger = makeHarnessLogger();
      const { manager } = makeHarness({
        logger,
        reactorClient: makeModelsClient([
          makeDriveModule(),
          makeModelModule("Widget", "test/widget"),
        ]),
        enableDocumentModelSubgraphs: true,
      });
      await initAndFlush(manager);
      class Owned extends BaseSubgraph {
        name = "owned";
      }
      const owned = await manager.registerSubgraph(
        Owned,
        "extra",
        false,
        "pkg",
      );
      await flush(manager.updateRouter());
      expect(manager.hasSubgraphHandler("owned")).toBe(true);

      await flush(
        manager.setSupergraph("extra", [owned!, makeWidgetSubgraph()]),
      );

      expect(manager.getSubgraphByName("owned")).toBe(owned);
      expect(manager.hasSubgraphHandler("owned")).toBe(true);
      expect(manager.getSubgraphByName("widget-stock")).toBeUndefined();
      expect(logger.error).toHaveBeenCalledWith(
        "Rejecting subgraph @name: @error",
        "widget-stock",
        expect.stringContaining("Widget"),
      );
    });

    it("a name in the root supergraph has one holder with graphql", async () => {
      const { manager } = makeHarness();
      await initAndFlush(manager);
      const rootDisconnect = vi.fn().mockResolvedValue(undefined);
      const root = {
        ...makeWidgetSubgraph("twin"),
        onDisconnect: rootDisconnect,
      };
      const replacement = makeWidgetSubgraph("twin");

      expect(await manager.registerSubgraphInstance(root, "")).toBe(root);
      expect(
        await manager.registerSubgraphInstance(replacement, "graphql"),
      ).toBe(replacement);
      await flush(manager.updateRouter());

      expect(rootDisconnect).toHaveBeenCalled();
      expect(registeredNamed(manager, "twin")).toEqual(new Set([replacement]));
      expect(manager.hasSubgraphHandler("twin")).toBe(true);
    });

    it("refuses a package subgraph whose name a host holds in the root supergraph", async () => {
      const logger = makeHarnessLogger();
      const { manager } = makeHarness({ logger });
      await initAndFlush(manager);
      const root = makeWidgetSubgraph("twin");
      await manager.registerSubgraphInstance(root, "");
      class Twin extends BaseSubgraph {
        name = "twin";
      }

      await manager.applyPackageSubgraphs(new Map([["pkg", [Twin]]]));
      await flush(manager.updateRouter());

      expect(registeredNamed(manager, "twin")).toEqual(new Set([root]));
      expect(logger.error).toHaveBeenCalledWith(
        ORIGIN_REJECTION,
        "twin",
        "package pkg",
        "the host",
      );
    });

    /** Registered instances named `name`, across every non-core bucket. */
    function registeredNamed(manager: GraphQLManager, name: string) {
      const { subgraphs } = manager as unknown as {
        subgraphs: Map<string, ISubgraph[]>;
      };
      return new Set(
        Array.from(subgraphs.values())
          .flat()
          .filter((it) => it.name === name),
      );
    }

    it("tears down a package registered at boot when a change no longer holds it", async () => {
      const { manager } = makeHarness();
      await initAndFlush(manager);
      const [AlphaA, alphaDisconnected] = (() => {
        const disconnected: string[] = [];
        class Alpha extends BaseSubgraph {
          name = "alpha";
          onDisconnect = () => {
            disconnected.push("alpha");
            return Promise.resolve();
          };
        }
        return [Alpha, disconnected] as const;
      })();
      class BetaB extends BaseSubgraph {
        name = "beta";
      }
      await manager.registerSubgraph(AlphaA, "graphql", false, "a");
      await manager.registerSubgraph(BetaB, "graphql", false, "b");

      await manager.applyPackageSubgraphs(new Map([["b", [BetaB]]]));

      expect(manager.getSubgraphByName("alpha")).toBeUndefined();
      expect(alphaDisconnected).toEqual(["alpha"]);
      expect(manager.getSubgraphByName("beta")).toBeInstanceOf(BetaB);
    });

    it("admits one owner when a model and a package subgraph of its name arrive together", async () => {
      const reactorClient = makeModelsClient([makeDriveModule()]);
      const { manager } = makeHarness({
        reactorClient,
        enableDocumentModelSubgraphs: true,
      });
      await initAndFlush(manager);
      class Squatter extends BaseSubgraph {
        name = reactorDriveModelSubgraphName;
        onSetup = () => new Promise<void>((resolve) => setTimeout(resolve, 5));
      }
      vi.mocked(reactorClient.getDocumentModelModules).mockResolvedValue({
        results: [makeDriveModule(), reactorDriveModel],
        options: { cursor: "", limit: 100 },
      });

      // As loadPackages emits both events back to back.
      const changes = Promise.all([
        manager.applyPackageSubgraphs(new Map([["pkg", [Squatter]]])),
        manager.regenerateDocumentModelSubgraphs(),
      ]);
      await flush(changes);

      const owners = registeredNamed(manager, reactorDriveModelSubgraphName);
      expect(owners.size).toBe(1);
      expect([...owners][0]).toBeInstanceOf(DocumentModelSubgraph);
    });

    it("overlapping regenerations leave one subgraph per model", async () => {
      const { manager } = makeHarness({
        reactorClient: makeModelsClient([makeDriveModule(), reactorDriveModel]),
        enableDocumentModelSubgraphs: true,
      });
      await initAndFlush(manager);
      const initial = manager.getSubgraphByName(reactorDriveModelSubgraphName);
      const disconnect = vi.spyOn(initial as BaseSubgraph, "onDisconnect");

      await flush(
        Promise.all([
          manager.regenerateDocumentModelSubgraphs(),
          manager.regenerateDocumentModelSubgraphs(),
        ]),
      );

      expect(registeredNamed(manager, reactorDriveModelSubgraphName).size).toBe(
        1,
      );
      expect(disconnect).toHaveBeenCalledTimes(1);
    });

    it("serves a package's subgraph again once the model that took its name is removed", async () => {
      const reactorClient = makeModelsClient([makeDriveModule()]);
      const { manager } = makeHarness({
        reactorClient,
        enableDocumentModelSubgraphs: true,
      });
      await initAndFlush(manager);
      class Squatter extends BaseSubgraph {
        name = reactorDriveModelSubgraphName;
      }
      await manager.applyPackageSubgraphs(new Map([["pkg", [Squatter]]]));

      vi.mocked(reactorClient.getDocumentModelModules).mockResolvedValue({
        results: [makeDriveModule(), reactorDriveModel],
        options: { cursor: "", limit: 100 },
      });
      await flush(manager.regenerateDocumentModelSubgraphs());
      expect(
        manager.getSubgraphByName(reactorDriveModelSubgraphName),
      ).toBeInstanceOf(DocumentModelSubgraph);

      // A document-model-only update: no package change follows.
      vi.mocked(reactorClient.getDocumentModelModules).mockResolvedValue({
        results: [makeDriveModule()],
        options: { cursor: "", limit: 100 },
      });
      await flush(manager.regenerateDocumentModelSubgraphs());

      expect(
        manager.getSubgraphByName(reactorDriveModelSubgraphName),
      ).toBeInstanceOf(Squatter);
      expect(manager.hasSubgraphHandler(reactorDriveModelSubgraphName)).toBe(
        true,
      );
    });

    it("serves a package's refused subgraph once the model holding its name is removed", async () => {
      const reactorClient = makeModelsClient([
        makeDriveModule(),
        reactorDriveModel,
      ]);
      const { manager } = makeHarness({
        reactorClient,
        enableDocumentModelSubgraphs: true,
      });
      await initAndFlush(manager);
      class Squatter extends BaseSubgraph {
        name = reactorDriveModelSubgraphName;
      }
      await manager.applyPackageSubgraphs(new Map([["pkg", [Squatter]]]));
      expect(
        manager.getSubgraphByName(reactorDriveModelSubgraphName),
      ).toBeInstanceOf(DocumentModelSubgraph);

      vi.mocked(reactorClient.getDocumentModelModules).mockResolvedValue({
        results: [makeDriveModule()],
        options: { cursor: "", limit: 100 },
      });
      await flush(manager.regenerateDocumentModelSubgraphs());

      expect(
        manager.getSubgraphByName(reactorDriveModelSubgraphName),
      ).toBeInstanceOf(Squatter);
    });

    it("runs a registration a subgraph's onSetup makes inline", async () => {
      const { manager } = makeHarness();
      await initAndFlush(manager);
      class Inner extends BaseSubgraph {
        name = "inner";
      }
      class Outer extends BaseSubgraph {
        name = "outer";
        onSetup = async () => {
          await this.graphqlManager.registerSubgraph(
            Inner,
            "graphql",
            false,
            "inner-pkg",
          );
        };
      }

      await manager.registerSubgraph(Outer, "graphql", false, "pkg");
      expect(manager.getSubgraphByName("outer")).toBeInstanceOf(Outer);
      expect(manager.getSubgraphByName("inner")).toBeInstanceOf(Inner);

      // The queue is not wedged: a later change still runs.
      const later = makeWidgetSubgraph("later");
      expect(await manager.registerSubgraphInstance(later, "graphql")).toBe(
        later,
      );
    });

    it("queues a registration a hook's timer makes once its change is over", async () => {
      const { manager } = makeHarness();
      await initAndFlush(manager);
      // Faked timers fire in the caller's async context and would hide the leak.
      vi.useRealTimers();

      const late = makeWidgetSubgraph("late");
      let detached: Promise<ISubgraph | undefined> | undefined;
      let timerFired!: () => void;
      const fired = new Promise<void>((resolve) => {
        timerFired = resolve;
      });
      class Starter extends BaseSubgraph {
        name = "starter";
        onSetup = () => {
          setTimeout(() => {
            detached = this.graphqlManager.registerSubgraphInstance(
              late,
              "graphql",
            );
            timerFired();
          }, 5);
          return Promise.resolve();
        };
      }
      await manager.registerSubgraph(Starter, "graphql", false, "pkg");

      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      class Blocker extends BaseSubgraph {
        name = "blocker";
        onSetup = () => gate;
      }
      const blocking = manager.registerSubgraph(
        Blocker,
        "graphql",
        false,
        "pkg",
      );
      await fired;
      await new Promise((resolve) => setImmediate(resolve));

      expect(detached).toBeDefined();
      expect(manager.getSubgraphByName("late")).toBeUndefined();

      release();
      await blocking;
      expect(await detached).toBe(late);
      expect(manager.getSubgraphByName("late")).toBe(late);
    });

    it("serves every model's subgraph when a model is named like a generated subgraph type", async () => {
      const logger = makeHarnessLogger();
      const { manager, gatewayAdapter } = makeHarness({
        logger,
        reactorClient: makeModelsClient([
          makeDriveModule(),
          makeModelModule("Revision", "test/revision"),
          makeModelModule("Gadget", "test/gadget"),
        ]),
        enableDocumentModelSubgraphs: true,
      });
      await initAndFlush(manager);

      for (const name of ["revision", "gadget"]) {
        expect(manager.getSubgraphByName(name)).toBeInstanceOf(
          DocumentModelSubgraph,
        );
        expect(manager.hasSubgraphHandler(name)).toBe(true);
      }
      const names = supergraphDefinitions(gatewayAdapter).map((d) => d.name);
      expect(names).toEqual(
        expect.arrayContaining([":graphql/revision", ":graphql/gadget"]),
      );
      expect(logger.error).not.toHaveBeenCalled();
    });

    it("setSupergraph mirrors its subgraphs under graphql when that bucket is missing", async () => {
      const { manager } = makeHarness();
      const sub = makeWidgetSubgraph("mirrored");

      await flush(manager.setSupergraph("extra", [sub]));

      const { subgraphs } = manager as unknown as {
        subgraphs: Map<string, ISubgraph[]>;
      };
      expect(subgraphs.get("extra")).toEqual([sub]);
      expect(subgraphs.get("graphql")).toEqual([sub]);
    });
  });

  describe("core types take precedence over document models", () => {
    const CORE = ["r", "system"];
    const REFUSAL =
      "Refusing document model @documentType from the GraphQL schema: @reason";

    async function flush<T>(pending: Promise<T>): Promise<T> {
      await vi.runAllTimersAsync();
      return pending;
    }

    function supergraphNames(
      gatewayAdapter: ReturnType<typeof makeHarness>["gatewayAdapter"],
    ): string[] {
      const getDefinitions = gatewayAdapter.createSupergraphHandler.mock
        .calls[0][0] as () => { name: string }[];
      return getDefinitions().map((d) => d.name);
    }

    function modelSubgraphName(model: DocumentModelModule): string {
      return new DocumentModelSubgraph(model, {
        reactorClient: {} as IReactorClient,
      } as SubgraphArgs).name;
    }

    function makeModelsHarness(
      models: DocumentModelModule[],
      enableDocumentModelSubgraphs = true,
    ) {
      const logger = makeHarnessLogger();
      const reactorClient = makeMockReactorClient({
        getDocumentModelModules: vi.fn().mockResolvedValue({ results: models }),
      });
      return {
        logger,
        ...makeHarness({
          logger,
          reactorClient,
          enableDocumentModelSubgraphs,
        }),
      };
    }

    function expectCoreServed(harness: ReturnType<typeof makeModelsHarness>) {
      const { manager, handles, gatewayAdapter } = harness;
      for (const name of CORE) {
        const route = handles.get(`/graphql/${name}`);
        expect(route).toBeDefined();
        expect(route?.dispose).not.toHaveBeenCalled();
        expect(manager.hasSubgraphHandler(name)).toBe(true);
      }
      expect(supergraphNames(gatewayAdapter)).toEqual(
        expect.arrayContaining(CORE.map((name) => `:graphql/${name}`)),
      );
    }

    async function expectModelRefused(
      harness: ReturnType<typeof makeModelsHarness>,
      model: DocumentModelModule,
      typeName: string,
    ) {
      const { manager, gatewayAdapter, logger, reactorClient } = harness;
      const name = modelSubgraphName(model);
      expect(manager.getSubgraphByName(name)).toBeUndefined();
      expect(supergraphNames(gatewayAdapter)).not.toContain(`:graphql/${name}`);
      expect(logger.error).toHaveBeenCalledWith(
        REFUSAL,
        model.documentModel.global.id,
        expect.stringContaining(typeName),
      );
      // Refused from the schema only: the reactor keeps serving the model.
      const { results } = await reactorClient.getDocumentModelModules();
      expect(results).toContain(model);
    }

    // A core type, a root type, a fixed generated type, a core type.
    const NAMES = ["Revision", "Query", "Signer", "SystemInfo"];

    it.each(NAMES)("refuses a boot model named %s", async (typeName) => {
      const model = makeModelModule(typeName, `test/${typeName}`);
      const gadget = makeModelModule("Gadget", "test/gadget");
      const harness = makeModelsHarness([makeDriveModule(), model, gadget]);

      await initAndFlush(harness.manager, [ReactorSubgraph, SystemSubgraph]);

      expectCoreServed(harness);
      await expectModelRefused(harness, model, typeName);
      expect(harness.manager.hasSubgraphHandler("gadget")).toBe(true);
    });

    it.each(NAMES)("refuses a hot-loaded model named %s", async (typeName) => {
      const model = makeModelModule(typeName, `test/${typeName}`);
      const harness = makeModelsHarness([makeDriveModule()]);
      await initAndFlush(harness.manager, [ReactorSubgraph, SystemSubgraph]);

      vi.mocked(
        harness.reactorClient.getDocumentModelModules,
      ).mockResolvedValue({
        results: [makeDriveModule(), model],
        options: { cursor: "", limit: 100 },
      });
      await flush(harness.manager.regenerateDocumentModelSubgraphs());
      await flush(harness.manager.updateRouter());

      expectCoreServed(harness);
      await expectModelRefused(harness, model, typeName);
    });

    it("refuses a boot model when document-model subgraphs are off", async () => {
      const model = makeModelModule("Revision", "test/revision");
      const { manager, gatewayAdapter, logger } = makeModelsHarness(
        [makeDriveModule(), model],
        false,
      );

      await initAndFlush(manager, [ReactorSubgraph, SystemSubgraph]);

      expect(manager.hasSubgraphHandler("r")).toBe(true);
      expect(supergraphNames(gatewayAdapter)).toContain(":graphql/r");
      expect(logger.error).toHaveBeenCalledWith(
        REFUSAL,
        "test/revision",
        expect.stringContaining("Revision"),
      );
    });

    it("logs a refused model once across regenerations", async () => {
      const model = makeModelModule("Revision", "test/revision");
      const harness = makeModelsHarness([makeDriveModule(), model]);
      await initAndFlush(harness.manager, [ReactorSubgraph, SystemSubgraph]);

      await flush(harness.manager.regenerateDocumentModelSubgraphs());

      const refusals = vi
        .mocked(harness.logger.error)
        .mock.calls.filter(([message]) => message === REFUSAL);
      expect(refusals).toHaveLength(1);
    });

    function withStateScalars(
      model: DocumentModelModule,
      scalars: string[],
    ): DocumentModelModule {
      const spec = model.documentModel.global.specifications[0];
      spec.state.global.schema = `${scalars.map((n) => `scalar ${n}`).join("\n")}\n${spec.state.global.schema}`;
      return model;
    }

    it("admits a model that redeclares standard scalars", async () => {
      const model = withStateScalars(makeModelModule("Gadget", "test/gadget"), [
        "AttachmentRef",
        "Amount",
      ]);
      const harness = makeModelsHarness([makeDriveModule(), model]);

      await initAndFlush(harness.manager, [ReactorSubgraph, SystemSubgraph]);

      expectCoreServed(harness);
      expect(harness.manager.hasSubgraphHandler("gadget")).toBe(true);
      expect(harness.logger.error).not.toHaveBeenCalledWith(
        REFUSAL,
        expect.anything(),
        expect.anything(),
      );
    });

    it("refuses a model that declares a core type as a scalar", async () => {
      const model = withStateScalars(makeModelModule("Gadget", "test/gadget"), [
        "Revision",
      ]);
      const harness = makeModelsHarness([makeDriveModule(), model]);

      await initAndFlush(harness.manager, [ReactorSubgraph, SystemSubgraph]);

      expectCoreServed(harness);
      await expectModelRefused(harness, model, "Revision");
    });

    it("admits the base models against the real core subgraphs", async () => {
      const models = [
        driveDocumentModelModule,
        documentModelDocumentModelModule,
        reactorDriveDocumentModelModule,
      ] as unknown as DocumentModelModule[];
      const harness = makeModelsHarness(models);

      await initAndFlush(harness.manager, [
        AnalyticsSubgraph,
        ReactorSubgraph,
        SystemSubgraph,
      ]);

      expect(
        vi
          .mocked(harness.logger.error)
          .mock.calls.filter(([message]) => message === REFUSAL),
      ).toEqual([]);
      for (const model of models) {
        expect(
          harness.manager.hasSubgraphHandler(modelSubgraphName(model)),
        ).toBe(true);
      }
    });
  });
});
