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

import {
  type IReactorClient,
  type IRelationalDb,
  type JobInfo,
  JobStatus,
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
import { type DocumentNode, type GraphQLSchema, Kind } from "graphql";
import { gql } from "graphql-tag";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentModelRegistry } from "@powerhousedao/reactor";
import { BaseSubgraph } from "../src/graphql/base-subgraph.js";
import { DocumentModelSubgraph } from "../src/graphql/document-model-subgraph.js";
import { AnalyticsSubgraph } from "../src/graphql/analytics-subgraph.js";
import { AuthSubgraph } from "../src/graphql/auth/subgraph.js";
import { ReactorSubgraph } from "../src/graphql/reactor/subgraph.js";
import { SystemSubgraph } from "../src/graphql/system/subgraph.js";
import {
  getDocumentModelSubgraphName,
  getGeneratedDocumentModelTypes,
} from "../src/utils/create-schema.js";

import {
  createAuthFetchMiddleware,
  type AuthFetchMiddleware,
} from "../src/graphql/gateway/auth-middleware.js";
import type { IAuthorizationService } from "../src/services/authorization.service.js";
import type { IAttachmentClientProvider } from "../src/services/authorized-attachment.service.js";
import type { IAttachmentClient } from "@powerhousedao/reactor-attachments/client";
import type {
  FetchHandler,
  IGatewayAdapter,
} from "../src/graphql/gateway/types.js";
import { createRequireAuthFetchMiddleware } from "../src/graphql/gateway/require-auth-middleware.js";
import type { GraphQLManager } from "../src/graphql/graphql-manager.js";
import {
  AuthorizationPolicy,
  createAuthorizationService,
} from "../src/services/authorization.service.js";
import type { HostedSubgraph } from "../src/graphql/hosted-subgraph.js";
import type {
  Context,
  SubgraphArgs,
  SubgraphClass,
} from "../src/graphql/types.js";
import type { AuthContext, AuthService } from "../src/services/auth.service.js";
import { PackageManager } from "../src/packages/package-manager.js";
import type { ISubscribablePackageLoader } from "../src/packages/types.js";
import { setupEventListeners } from "../src/packages/package-listeners.js";
import type { IProcessorHostModule } from "../src/types.js";
import { useServer } from "../src/graphql/websocket.js";

vi.mock("../src/graphql/websocket.js", () => ({
  useServer: vi.fn(() => ({ dispose: vi.fn() })),
}));

/** The options the manager's one graphql-ws server was started with. */
function wsServerOptions() {
  return vi.mocked(useServer).mock.calls[0][0] as unknown as {
    onConnect: (ctx: object) => Promise<boolean>;
    context: (ctx: object) => Promise<unknown>;
  };
}

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

import {
  type HarnessOptions,
  initAndFlush,
  makeDriveModule,
  makeHarness,
  makeHarnessLogger,
  makeMockReactorClient,
} from "./utils/graphql-manager-harness.js";
import { PublishedBaseSubgraph } from "./utils/published-base-subgraph.js";
import { sdlBase } from "./utils/sdl-base.js";

const instanceArgs = {
  reactorClient: {} as IReactorClient,
  relationalDb: {} as IRelationalDb,
} as SubgraphArgs;

type SubgraphHooks = Partial<Pick<BaseSubgraph, "onSetup" | "onDisconnect">>;

function sdlSubgraph(
  name: string,
  typeDefs: DocumentNode | string,
  resolvers: Record<string, unknown> = {},
): SubgraphClass {
  return class extends sdlBase(typeDefs, resolvers) {
    static override readonly subgraphName = name;
  };
}

function sdlInstance(
  name: string,
  typeDefs: DocumentNode | string,
  resolvers: Record<string, unknown> = {},
  hooks: SubgraphHooks = {},
): BaseSubgraph {
  const SdlSubgraph = sdlSubgraph(name, typeDefs, resolvers);
  return Object.assign(new SdlSubgraph(instanceArgs), hooks);
}

function bucketInstances(manager: GraphQLManager) {
  const { subgraphs } = manager as unknown as {
    subgraphs: Map<string, HostedSubgraph[]>;
  };
  return new Map(
    Array.from(subgraphs, ([bucket, hosted]) => [
      bucket,
      hosted.map((record) => record.instance),
    ]),
  );
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
      const { manager } = makeHarness();
      manager.setAdditionalContextFields({
        user: { address: "0xinjected" },
        customField: "custom-value",
      });
      await registerSubscriptionSubgraph(manager);
      await initAndFlush(manager);

      const options = wsServerOptions();
      const connection = { connectionParams: {}, extra: {} };
      await expect(options.onConnect(connection)).resolves.toBe(true);
      const ctx = (await options.context(connection)) as Record<
        string,
        unknown
      >;

      expect(ctx["customField"]).toBe("custom-value");
      expect(ctx.user).toBeUndefined();
    });
  });

  // ── SSE handler ────────────────────────────────────────────────────────────

  async function registerSubscriptionSubgraph(manager: GraphQLManager) {
    await manager.registerSubgraphInstance(
      sdlInstance(
        "test-subscription-sub",
        gql`
          type Query {
            _placeholder: Boolean
          }
          type Subscription {
            ping: String
          }
        `,
        {
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
      ),
      "graphql",
    );
  }

  /** A subscription subgraph whose `<field>` subscription yields `value`. */
  async function registerStreamSubgraph(
    manager: GraphQLManager,
    name: string,
    field: string,
    value: string,
  ) {
    await manager.registerSubgraphInstance(
      sdlInstance(
        name,
        `
          type Query {
            ${field}Info: String
          }
          type Subscription {
            ${field}: String
          }
        `,
        {
          Query: { [`${field}Info`]: () => value },
          Subscription: {
            [field]: {
              subscribe: async function* () {
                await Promise.resolve();
                yield { [field]: value };
              },
            },
          },
        },
      ),
      "graphql",
    );
  }

  /** Run `query` over the SSE handler and return the raw event stream. */
  async function streamOver(handler: FetchHandler, query: string) {
    const res = await handler(
      new Request("http://localhost/graphql/stream", {
        method: "POST",
        headers: {
          accept: "text/event-stream",
          "content-type": "application/json",
        },
        body: JSON.stringify({ query }),
      }),
    );
    return res.text();
  }

  /** Subscribe over the SSE handler and read events until one carries `needle`. */
  async function streamUntil(
    handler: FetchHandler,
    query: string,
    needle: string,
  ) {
    const res = await handler(
      new Request("http://localhost/graphql/stream", {
        method: "POST",
        headers: {
          accept: "text/event-stream",
          "content-type": "application/json",
        },
        body: JSON.stringify({ query }),
      }),
    );
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
    let events = "";
    try {
      while (!events.includes(needle)) {
        const { value, done } = await reader.read();
        if (done) break;
        events += value;
      }
    } finally {
      await reader.cancel();
    }
    return events;
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
      class PackagedSubscriptions extends sdlBase(
        gql`
          type Query {
            _placeholder: Boolean
          }
          type Subscription {
            ping: String
          }
        `,
        {
          Subscription: {
            ping: {
              subscribe: async function* () {
                await Promise.resolve();
                yield { ping: "pong" };
              },
            },
          },
        },
      ) {
        static override readonly subgraphName = "packaged-subs";
      }
      await manager.registerSubgraph(
        PackagedSubscriptions,
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

    it("merges every subscription subgraph into the supergraph stream", async () => {
      const { manager, mounts } = makeHarness();
      await registerStreamSubgraph(manager, "stream-a", "alpha", "from-a");
      await registerStreamSubgraph(manager, "stream-b", "beta", "from-b");
      await initAndFlush(manager);
      vi.useRealTimers();

      const handler = mounts.get("/graphql/stream");
      expect(handler).toBeDefined();
      expect(await streamOver(handler!, "subscription { alpha }")).toContain(
        '{"data":{"alpha":"from-a"}}',
      );
      expect(await streamOver(handler!, "subscription { beta }")).toContain(
        '{"data":{"beta":"from-b"}}',
      );
      expect(await streamOver(handler!, "{ alphaInfo betaInfo }")).toContain(
        '{"data":{"alphaInfo":"from-a","betaInfo":"from-b"}}',
      );
    });

    it("excludes a broken subscription subgraph from the stream and keeps the rest", async () => {
      const logger = makeHarnessLogger();
      const { manager, mounts } = makeHarness({ logger });
      await registerStreamSubgraph(manager, "stream-a", "alpha", "from-a");
      await manager.registerSubgraphInstance(
        sdlInstance(
          "stream-broken",
          gql`
            type Subscription {
              broken: NoSuchType
            }
          `,
        ),
        "graphql",
      );
      await registerStreamSubgraph(manager, "stream-b", "beta", "from-b");
      await initAndFlush(manager);
      vi.useRealTimers();

      const handler = mounts.get("/graphql/stream");
      expect(handler).toBeDefined();
      expect(await streamOver(handler!, "subscription { alpha }")).toContain(
        '{"data":{"alpha":"from-a"}}',
      );
      expect(await streamOver(handler!, "subscription { beta }")).toContain(
        '{"data":{"beta":"from-b"}}',
      );
      const sseExclusions = vi
        .mocked(logger.error)
        .mock.calls.map((call) => String(call[0]))
        .filter((message) => message.startsWith("Supergraph SSE:"));
      expect(sseExclusions).toHaveLength(1);
      expect(sseExclusions[0]).toContain('"stream-broken"');
      expect(sseExclusions[0]).toContain("NoSuchType");
    });

    it("keeps a subgraph with custom operation roots out of the stream, so it cannot take the stream's roots", async () => {
      const logger = makeHarnessLogger();
      const { manager, mounts } = makeHarness({ logger });
      await registerStreamSubgraph(manager, "stream-a", "alpha", "from-a");
      await manager.registerSubgraphInstance(
        sdlInstance(
          "stream-custom",
          gql`
            schema {
              query: Q
              subscription: S
            }
            type Q {
              gammaInfo: String
            }
            type S {
              gamma: String
            }
          `,
          {
            Q: { gammaInfo: () => "from-custom" },
            S: {
              gamma: {
                subscribe: async function* () {
                  await Promise.resolve();
                  yield { gamma: "from-custom" };
                },
              },
            },
          },
        ),
        "graphql",
      );
      await initAndFlush(manager);
      vi.useRealTimers();

      expect(
        await streamOver(
          mounts.get("/graphql/stream")!,
          "subscription { alpha }",
        ),
      ).toContain('{"data":{"alpha":"from-a"}}');
      expect(
        await streamOver(
          mounts.get("/graphql/stream-custom/stream")!,
          "subscription { gamma }",
        ),
      ).toContain('{"data":{"gamma":"from-custom"}}');
      expect(
        vi
          .mocked(logger.error)
          .mock.calls.filter(([message]) =>
            String(message).startsWith("Supergraph SSE:"),
          ),
      ).toEqual([
        [
          'Supergraph SSE: excluding subgraph "stream-custom": its schema names the operation roots query: Q, subscription: S. Subscribe to it at /graphql/stream-custom/stream.',
        ],
      ]);
    });

    it("merges the reactor subgraph's subscriptions with another subgraph's", async () => {
      const logger = makeHarnessLogger();
      const reactorClient = makeMockReactorClient({
        isServed: vi.fn().mockResolvedValue(true),
        // Answers after the subscriber listens: earlier events are not replayed.
        getJobStatus: vi.fn(
          () =>
            new Promise<JobInfo>((resolve) =>
              setTimeout(
                () =>
                  resolve({
                    id: "job-1",
                    status: JobStatus.READ_READY,
                    createdAtUtcIso: "2026-01-01T00:00:00.000Z",
                    completedAtUtcIso: "2026-01-01T00:00:01.000Z",
                    documentId: "doc-1",
                  } as JobInfo),
                50,
              ),
            ),
        ),
      });
      const { manager, mounts } = makeHarness({ logger, reactorClient });
      await registerStreamSubgraph(manager, "stream-a", "alpha", "from-a");
      await initAndFlush(manager, [ReactorSubgraph]);
      vi.useRealTimers();

      const sseErrors = vi
        .mocked(logger.error)
        .mock.calls.map((call) => String(call[0]))
        .filter((message) => /SSE/.test(message));
      expect(sseErrors).toEqual([]);
      const handler = mounts.get("/graphql/stream");
      expect(handler).toBeDefined();
      const events = await streamOver(
        handler!,
        '{ __type(name: "Subscription") { fields { name } } }',
      );
      for (const field of ["alpha", "documentChanges", "jobChanges"]) {
        expect(events).toContain(`{"name":"${field}"}`);
      }
      const jobEvent =
        '{"data":{"jobChanges":{"jobId":"job-1","status":"READ_READY"}}}';
      expect(
        await streamUntil(
          handler!,
          'subscription { jobChanges(jobId: "job-1") { jobId status } }',
          jobEvent,
        ),
      ).toContain(jobEvent);
    });

    it("streams a subscription subgraph that uses federation directives", async () => {
      const { manager, mounts } = makeHarness();
      await registerStreamSubgraph(manager, "stream-a", "alpha", "from-a");
      await manager.registerSubgraphInstance(
        sdlInstance(
          "stream-federated",
          gql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.3"
                import: ["@key", "@shareable"]
              )
            type StreamThing @key(fields: "id") {
              id: ID!
            }
            type Query {
              streamThing: StreamThing @shareable
            }
            type Subscription {
              thingAdded: StreamThing
            }
          `,
          {
            Query: { streamThing: () => ({ id: "t-1" }) },
            Subscription: {
              thingAdded: {
                subscribe: async function* () {
                  await Promise.resolve();
                  yield { thingAdded: { id: "t-2" } };
                },
              },
            },
          },
        ),
        "graphql",
      );
      await initAndFlush(manager);
      vi.useRealTimers();

      const handler = mounts.get("/graphql/stream");
      expect(handler).toBeDefined();
      expect(
        await streamOver(handler!, "subscription { thingAdded { id } }"),
      ).toContain('{"data":{"thingAdded":{"id":"t-2"}}}');
      expect(
        await streamOver(handler!, "{ alphaInfo streamThing { id } }"),
      ).toContain('{"data":{"alphaInfo":"from-a","streamThing":{"id":"t-1"}}}');
    });

    it("streams subgraphs that only extend the root types", async () => {
      const logger = makeHarnessLogger();
      const { manager, mounts } = makeHarness({ logger });
      await manager.registerSubgraphInstance(
        sdlInstance(
          "stream-extends",
          gql`
            extend type Query {
              extInfo: String
            }
            extend type Subscription {
              extTick: String
            }
          `,
          {
            Query: { extInfo: () => "info" },
            Subscription: {
              extTick: {
                subscribe: async function* () {
                  await Promise.resolve();
                  yield { extTick: "tick" };
                },
              },
            },
          },
        ),
        "graphql",
      );
      await initAndFlush(manager);
      vi.useRealTimers();

      const handler = mounts.get("/graphql/stream");
      expect(handler).toBeDefined();
      expect(await streamOver(handler!, "subscription { extTick }")).toContain(
        '{"data":{"extTick":"tick"}}',
      );
      expect(vi.mocked(logger.error)).not.toHaveBeenCalledWith(
        "Failed to setup supergraph SSE: @error",
        expect.anything(),
      );
    });

    it("streams subscription subgraphs that contribute no Query root", async () => {
      const logger = makeHarnessLogger();
      const { manager, mounts } = makeHarness({ logger });
      await manager.registerSubgraphInstance(
        sdlInstance(
          "stream-no-query",
          gql`
            type Subscription {
              lonely: String
            }
          `,
          {
            Subscription: {
              lonely: {
                subscribe: async function* () {
                  await Promise.resolve();
                  yield { lonely: "here" };
                },
              },
            },
          },
        ),
        "graphql",
      );
      await initAndFlush(manager);
      vi.useRealTimers();

      const handler = mounts.get("/graphql/stream");
      expect(handler).toBeDefined();
      expect(await streamOver(handler!, "subscription { lonely }")).toContain(
        '{"data":{"lonely":"here"}}',
      );
      expect(vi.mocked(logger.error)).not.toHaveBeenCalledWith(
        "Failed to setup supergraph SSE: @error",
        expect.anything(),
      );
    });

    it("logs an exclusion again when the subgraph breaks after recovering", async () => {
      const logger = makeHarnessLogger();
      const { manager } = makeHarness({ logger });
      const brokenTypeDefs = gql`
        type Subscription {
          broken: NoSuchType
        }
      `;
      const register = (typeDefs: DocumentNode) =>
        manager.registerSubgraphInstance(
          sdlInstance("stream-flaky", typeDefs),
          "graphql",
        );
      const sseExclusions = () =>
        vi
          .mocked(logger.error)
          .mock.calls.map((call) => String(call[0]))
          .filter((message) => message.includes('"stream-flaky"'));
      const flushRouter = async () => {
        const update = manager.updateRouter();
        await vi.runAllTimersAsync();
        await update;
      };

      await registerStreamSubgraph(manager, "stream-a", "alpha", "from-a");
      await register(brokenTypeDefs);
      await initAndFlush(manager);
      expect(sseExclusions()).toHaveLength(1);

      await register(gql`
        type Subscription {
          flaky: String
        }
      `);
      await flushRouter();
      expect(sseExclusions()).toHaveLength(1);

      await register(brokenTypeDefs);
      await flushRouter();
      expect(sseExclusions()).toHaveLength(2);
    });

    it("resolves interface-typed fields over the supergraph stream", async () => {
      const { manager, mounts } = makeHarness();
      await registerStreamSubgraph(manager, "stream-a", "alpha", "from-a");
      await manager.registerSubgraphInstance(
        sdlInstance(
          "stream-nodes",
          gql`
            interface StreamNode {
              id: ID!
            }
            type StreamItem implements StreamNode {
              id: ID!
            }
            type Query {
              streamNode: StreamNode
            }
            type Subscription {
              nodeAdded: StreamNode
            }
          `,
          {
            Query: { streamNode: () => ({ id: "n-1" }) },
            Subscription: {
              nodeAdded: {
                subscribe: async function* () {
                  await Promise.resolve();
                  yield { nodeAdded: { id: "n-2" } };
                },
              },
            },
            StreamNode: { __resolveType: () => "StreamItem" },
          },
        ),
        "graphql",
      );
      await initAndFlush(manager);
      vi.useRealTimers();

      const handler = mounts.get("/graphql/stream");
      expect(handler).toBeDefined();
      expect(
        await streamOver(
          handler!,
          "subscription { nodeAdded { __typename id } }",
        ),
      ).toContain(
        '{"data":{"nodeAdded":{"__typename":"StreamItem","id":"n-2"}}}',
      );
      expect(
        await streamOver(handler!, "{ streamNode { __typename id } }"),
      ).toContain(
        '{"data":{"streamNode":{"__typename":"StreamItem","id":"n-1"}}}',
      );
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
    function makeSub(name: string, hooks: SubgraphHooks = {}) {
      return sdlInstance(name, "type Query { hi: String }", {}, hooks);
    }

    function makeSubscriptionSub(name: string) {
      return sdlInstance(
        name,
        "type Query { hi: String } type Subscription { tick: String }",
      );
    }

    it("re-registering the identical instance is a no-op (no onDisconnect, one onSetup)", async () => {
      const { manager } = makeHarness();
      const onSetup = vi.fn().mockResolvedValue(undefined);
      const onDisconnect = vi.fn().mockResolvedValue(undefined);

      const sub = makeSub("unique-sub", { onSetup, onDisconnect });

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

      const oldSub = makeSub("my-sub", { onDisconnect: oldOnDisconnect });
      const newSub = makeSub("my-sub", { onSetup: newOnSetup });

      await manager.registerSubgraphInstance(oldSub, "graphql");
      const result = await manager.registerSubgraphInstance(newSub, "graphql");

      expect(result).toBe(newSub);
      expect(oldOnDisconnect).toHaveBeenCalledTimes(1);
      expect(newOnSetup).toHaveBeenCalledTimes(1);
      expect(manager.getSubgraphByName("my-sub")).toBe(newSub);
    });

    it("a throwing onDisconnect does not abort the replacement", async () => {
      const { manager } = makeHarness();
      const oldSub = makeSub("my-sub", {
        onDisconnect: vi.fn().mockRejectedValue(new Error("boom")),
      });
      const newSub = makeSub("my-sub");

      await manager.registerSubgraphInstance(oldSub, "graphql");
      const result = await manager.registerSubgraphInstance(newSub, "graphql");

      expect(result).toBe(newSub);
      expect(manager.getSubgraphByName("my-sub")).toBe(newSub);
    });

    it("replacement keeps the one WebSocket server", async () => {
      const { manager } = makeHarness();

      const oldSub = makeSubscriptionSub("ws-sub");
      await manager.registerSubgraphInstance(oldSub, "graphql");
      await initAndFlush(manager);
      expect(useServer).toHaveBeenCalledTimes(1);

      const newSub = makeSubscriptionSub("ws-sub");
      const result = await manager.registerSubgraphInstance(newSub, "graphql");
      const update = manager.updateRouter();
      await vi.runAllTimersAsync();
      await update;

      expect(useServer).toHaveBeenCalledTimes(1);
      const { dispose } = vi.mocked(useServer).mock.results[0].value as {
        dispose: ReturnType<typeof vi.fn>;
      };
      expect(dispose).not.toHaveBeenCalled();
      expect(result).toBe(newSub);
      expect(manager.getSubgraphByName("ws-sub")).toBe(newSub);
    });

    it("replacement invalidates the handler cache so the handler is rebuilt", async () => {
      const { manager, gatewayAdapter } = makeHarness();

      const oldSub = makeSub("my-sub");
      await manager.registerSubgraphInstance(oldSub, "graphql");
      await initAndFlush(manager);

      // One handler built for the subgraph's path on first setup.
      expect(gatewayAdapter.createHandler).toHaveBeenCalledTimes(1);

      // Re-running the router without a replacement reuses the cached handler.
      const noopUpdate = manager.updateRouter();
      await vi.runAllTimersAsync();
      await noopUpdate;
      expect(gatewayAdapter.createHandler).toHaveBeenCalledTimes(1);

      const newSub = makeSub("my-sub");
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
      await harness.manager.registerSubgraphInstance(
        sdlInstance(
          "echo",
          gql`
            type Query {
              echo(input: String!): String
            }
          `,
        ),
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

      expect(manager.getSubgraphByName("echo")).toMatchObject({
        subgraphName: "echo",
      });
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

      expect(manager.getSubgraphByName("echo")).toMatchObject({
        subgraphName: "echo",
      });
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

      const sub = sdlInstance("cached-sub", "type Query { hi: String }");

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

  describe("stale subgraph handlers", () => {
    type Gateway = ReturnType<typeof makeHarness>["gatewayAdapter"];

    // Field names, not printSchema: the schema comes from another graphql realm.
    const fieldNames = (schema: GraphQLSchema) =>
      Object.values(schema.getTypeMap())
        .flatMap((type) =>
          "getFields" in type ? Object.keys(type.getFields()) : [],
        )
        .join(" ");

    const servingSdl =
      (schema: GraphQLSchema): FetchHandler =>
      () =>
        Promise.resolve(Response.json({ data: { sdl: fieldNames(schema) } }));

    const createHandlerOf = (gatewayAdapter: Gateway) =>
      vi.mocked(
        gatewayAdapter.createHandler as IGatewayAdapter<Context>["createHandler"],
      );

    function serveSdl(gatewayAdapter: Gateway) {
      createHandlerOf(gatewayAdapter).mockImplementation((schema) =>
        Promise.resolve(servingSdl(schema)),
      );
    }

    function holdNextHandler(gatewayAdapter: Gateway) {
      let release!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const started = vi.fn();
      createHandlerOf(gatewayAdapter).mockImplementationOnce(async (schema) => {
        started();
        await held;
        return servingSdl(schema);
      });
      return { release, started };
    }

    async function servedSdl(
      mounts: Map<string, FetchHandler>,
      path: string,
    ): Promise<string> {
      const response = await mounts.get(path)!(
        new Request(`http://localhost${path}`, { method: "POST" }),
      );
      const body = (await response.json()) as { data: { sdl: string } };
      return body.data.sdl;
    }

    async function internalSdl(manager: GraphQLManager, name: string) {
      const data = await manager.executeSubgraphQuery<{ sdl: string }>(
        name,
        "{ __typename }",
        {},
      );
      return data.sdl;
    }

    function racer(field: string) {
      return sdlSubgraph("racer", `type Query { ${field}: String }`);
    }

    function alphaWith(field: string): DocumentModelModule {
      const alpha = makeModelModule("Alpha", "test/alpha");
      alpha.documentModel.global.specifications[0].state.global.schema = `type AlphaState { ${field}: String }`;
      return alpha;
    }

    it("mounts the package subgraph that replaced it", async () => {
      const { manager, mounts, gatewayAdapter } = makeHarness();
      serveSdl(gatewayAdapter);
      await initAndFlush(manager);
      const apply = (field: string) =>
        manager.applyPackageSubgraphs(new Map([["pkg", [racer(field)]]]));

      await apply("rev1");
      await vi.runAllTimersAsync();
      expect(await servedSdl(mounts, "/graphql/racer")).toContain("rev1");

      const hold = holdNextHandler(gatewayAdapter);
      await apply("rev2");
      await vi.advanceTimersByTimeAsync(1000);
      expect(hold.started).toHaveBeenCalled();

      await apply("rev3");
      hold.release();
      await vi.runAllTimersAsync();
      expect(await servedSdl(mounts, "/graphql/racer")).toContain("rev3");

      // A later update must not take the stale handler for the current one.
      await manager.updateRouter(true);
      expect(await servedSdl(mounts, "/graphql/racer")).toContain("rev3");
      expect(await internalSdl(manager, "racer")).toContain("rev3");
    });

    it("mounts the document model subgraph that replaced it", async () => {
      const reactorClient = makeMockReactorClient({
        getDocumentModelModules: vi.fn().mockResolvedValue({
          results: [makeDriveModule(), alphaWith("rev1")],
        }),
      });
      const { manager, mounts, gatewayAdapter } = makeHarness({
        reactorClient,
        enableDocumentModelSubgraphs: true,
      });
      serveSdl(gatewayAdapter);
      await initAndFlush(manager);
      expect(await servedSdl(mounts, "/graphql/alpha")).toContain("rev1");

      const regenerate = async (field: string) => {
        vi.mocked(reactorClient.getDocumentModelModules).mockResolvedValue({
          results: [makeDriveModule(), alphaWith(field)],
          options: { cursor: "", limit: 100 },
        });
        await manager.regenerateDocumentModelSubgraphs();
      };

      const hold = holdNextHandler(gatewayAdapter);
      await regenerate("rev2");
      await vi.advanceTimersByTimeAsync(1000);
      expect(hold.started).toHaveBeenCalled();

      await regenerate("rev3");
      hold.release();
      await vi.runAllTimersAsync();
      expect(await servedSdl(mounts, "/graphql/alpha")).toContain("rev3");

      await manager.updateRouter(true);
      const served = await servedSdl(mounts, "/graphql/alpha");
      expect(served).toContain("rev3");
      expect(served).not.toContain("rev2");
      expect(await internalSdl(manager, "alpha")).toContain("rev3");
    });
    async function setupAlphaTools(
      typeDefs = "type Query { alphaDoc: Alpha }",
    ) {
      const reactorClient = makeMockReactorClient({
        getDocumentModelModules: vi.fn().mockResolvedValue({
          results: [makeDriveModule(), alphaWith("rev1")],
        }),
      });
      const logger = makeHarnessLogger();
      const harness = makeHarness({
        reactorClient,
        logger,
        enableDocumentModelSubgraphs: true,
      });
      serveSdl(harness.gatewayAdapter);
      await initAndFlush(harness.manager);
      class AlphaTools extends sdlBase(typeDefs) {
        static override readonly subgraphName = "alpha-tools";
      }
      class Plain extends sdlBase("type Query { ping: String }") {
        static override readonly subgraphName = "plain";
      }
      await harness.manager.applyPackageSubgraphs(
        new Map([["pkg", [AlphaTools, Plain]]]),
      );
      await vi.runAllTimersAsync();
      expect(await servedSdl(harness.mounts, "/graphql/alpha-tools")).toContain(
        "rev1",
      );
      const regenerate = async (field: string) => {
        vi.mocked(reactorClient.getDocumentModelModules).mockResolvedValue({
          results: [makeDriveModule(), alphaWith(field)],
          options: { cursor: "", limit: 100 },
        });
        await harness.manager.regenerateDocumentModelSubgraphs();
      };
      const served = () => servedSdl(harness.mounts, "/graphql/alpha-tools");
      return { ...harness, logger, regenerate, served };
    }

    it("rebuilds a subgraph using a model's types after the model changes", async () => {
      const { manager, mounts, regenerate, served } = await setupAlphaTools();
      const plainHandler = mounts.get("/graphql/plain");

      await regenerate("rev2");
      await vi.runAllTimersAsync();

      expect(await served()).toContain("rev2");
      expect(await served()).not.toContain("rev1");
      expect(await internalSdl(manager, "alpha-tools")).toContain("rev2");
      // Uses no model type, so its handler is kept.
      expect(mounts.get("/graphql/plain")).toBe(plainHandler);
    });

    it("rebuilds a subgraph that only extends a model's type", async () => {
      const { regenerate, served } = await setupAlphaTools(
        "type Query { ping: String } extend type Alpha_AlphaState { extra: String }",
      );

      await regenerate("rev2");
      await vi.runAllTimersAsync();

      expect(await served()).toContain("rev2");
    });

    it("keeps the handler when a regeneration leaves the model types alone", async () => {
      const { mounts, regenerate } = await setupAlphaTools();
      const handler = mounts.get("/graphql/alpha-tools");

      await regenerate("rev1");
      await vi.runAllTimersAsync();

      expect(mounts.get("/graphql/alpha-tools")).toBe(handler);
    });

    it("serves the old handler until its rebuild succeeds", async () => {
      const { manager, handles, disposed, gatewayAdapter, logger, ...rest } =
        await setupAlphaTools();
      let route = handles.get("/graphql/alpha-tools");

      const hold = holdNextHandler(gatewayAdapter);
      await rest.regenerate("rev2");
      await vi.advanceTimersByTimeAsync(1000);
      expect(hold.started).toHaveBeenCalled();
      expect(disposed).not.toContain(route);
      expect(await rest.served()).toContain("rev1");
      hold.release();
      await vi.runAllTimersAsync();
      expect(await rest.served()).toContain("rev2");

      route = handles.get("/graphql/alpha-tools");
      createHandlerOf(gatewayAdapter).mockImplementation((schema) =>
        schema.getQueryType()?.getFields().alphaDoc
          ? Promise.reject(new Error("boom"))
          : Promise.resolve(servingSdl(schema)),
      );
      await rest.regenerate("rev3");
      await vi.runAllTimersAsync();

      expect(disposed).not.toContain(route);
      expect(await rest.served()).toContain("rev2");
      expect(await internalSdl(manager, "alpha-tools")).toContain("rev2");
      expect(logger.error).toHaveBeenCalledWith(
        "Failed to setup subgraph @name at path @path: @error",
        "alpha-tools",
        "/graphql/alpha-tools",
        expect.any(Error),
      );
    });

    it("keeps the newest build when an older one finishes last", async () => {
      const { manager, gatewayAdapter, regenerate, served } =
        await setupAlphaTools();

      const older = holdNextHandler(gatewayAdapter);
      await regenerate("rev2");
      await vi.advanceTimersByTimeAsync(1000);
      expect(older.started).toHaveBeenCalled();

      const newer = holdNextHandler(gatewayAdapter);
      await regenerate("rev3");
      await vi.advanceTimersByTimeAsync(1000);
      expect(newer.started).toHaveBeenCalled();

      newer.release();
      await vi.runAllTimersAsync();
      expect(await served()).toContain("rev3");

      older.release();
      await vi.runAllTimersAsync();
      expect(await served()).toContain("rev3");
      expect(await served()).not.toContain("rev2");
      expect(await internalSdl(manager, "alpha-tools")).toContain("rev3");
    });
  });

  describe("document models a package stops providing", () => {
    function setup(initial: DocumentModelModule[]) {
      const registry = new DocumentModelRegistry();
      registry.registerModules(makeDriveModule(), ...initial);
      const reactorClient = makeMockReactorClient({
        getDocumentModelModules: vi.fn(() =>
          Promise.resolve({
            results: registry.getAllModules(),
            options: { cursor: "", limit: 100 },
          }),
        ),
      });
      const harness = makeHarness({
        reactorClient,
        enableDocumentModelSubgraphs: true,
      });
      let emit!: (models: Record<string, DocumentModelModule[]>) => void;
      const pkgManager = {
        getDocumentModels: () => new Map([["pkg", initial]]),
        getUniqueUpgradeManifests: () => [],
        onDocumentModelsChange: (handler: typeof emit) => {
          emit = handler;
        },
        onSubgraphsChange: vi.fn(),
        onProcessorsChange: vi.fn(),
      } as unknown as PackageManager;
      setupEventListeners(
        pkgManager,
        harness.manager,
        {} as Parameters<typeof setupEventListeners>[2],
        () => ({}) as IProcessorHostModule,
        registry,
      );
      const modelsChange = async (
        models: Record<string, DocumentModelModule[]>,
      ) => {
        emit(models);
        await vi.runAllTimersAsync();
      };
      const registeredTypes = () =>
        registry.getAllModules().map((m) => m.documentModel.global.id);
      return { ...harness, registry, modelsChange, registeredTypes };
    }

    function supergraphTypeNames(
      gatewayAdapter: ReturnType<typeof makeHarness>["gatewayAdapter"],
    ): (string | undefined)[] {
      const getDefinitions = gatewayAdapter.createSupergraphHandler.mock
        .calls[0][0] as () => { typeDefs: DocumentNode }[];
      return getDefinitions().flatMap(({ typeDefs }) =>
        typeDefs.definitions.map((def) =>
          "name" in def ? def.name?.value : undefined,
        ),
      );
    }

    const alpha = makeModelModule("Alpha", "test/alpha");
    const beta = makeModelModule("Beta", "test/beta");

    it("unregisters a removed model and frees its subgraph name", async () => {
      const {
        manager,
        handles,
        disposed,
        gatewayAdapter,
        modelsChange,
        registeredTypes,
      } = setup([alpha, beta]);
      await initAndFlush(manager);
      class BetaStandIn extends sdlBase("type Query { betaStandIn: String }") {
        static override readonly subgraphName = "beta";
      }
      await manager.applyPackageSubgraphs(new Map([["other", [BetaStandIn]]]));
      await vi.runAllTimersAsync();
      expect(manager.getSubgraphByName("beta")).toBeInstanceOf(
        DocumentModelSubgraph,
      );
      const modelRoute = handles.get("/graphql/beta");

      await modelsChange({ pkg: [alpha] });

      expect(registeredTypes()).not.toContain("test/beta");
      expect(registeredTypes()).toContain("test/alpha");
      expect(disposed).toContain(modelRoute);
      expect(manager.getSubgraphByName("beta")).toBeInstanceOf(BetaStandIn);
      expect(manager.hasSubgraphHandler("beta")).toBe(true);
      const typeNames = supergraphTypeNames(gatewayAdapter);
      expect(typeNames).toContain("Alpha");
      expect(typeNames).not.toContain("Beta");
    });

    it("unregisters a model whose id changed", async () => {
      const { manager, modelsChange, registeredTypes } = setup([alpha, beta]);
      await initAndFlush(manager);

      await modelsChange({
        pkg: [alpha, makeModelModule("Beta", "test/beta-renamed")],
      });

      expect(registeredTypes()).not.toContain("test/beta");
      expect(registeredTypes()).toContain("test/beta-renamed");
    });

    it.each([
      ["missing from the event", {}],
      ["with no models", { pkg: [] }],
    ])(
      "unregisters the models of a package %s",
      async (_, event: Record<string, DocumentModelModule[]>) => {
        const { manager, modelsChange, registeredTypes } = setup([alpha, beta]);
        await initAndFlush(manager);

        await modelsChange(event);

        expect(registeredTypes()).not.toContain("test/alpha");
        expect(registeredTypes()).not.toContain("test/beta");
      },
    );

    it("keeps a model another package still provides", async () => {
      const { manager, modelsChange, registeredTypes } = setup([alpha, beta]);
      await initAndFlush(manager);

      await modelsChange({ other: [beta] });

      expect(registeredTypes()).not.toContain("test/alpha");
      expect(registeredTypes()).toContain("test/beta");
    });

    describe("through the package manager", () => {
      class BetaStandIn extends sdlBase("type Query { betaStandIn: String }") {
        static override readonly subgraphName = "beta";
      }

      const missing = Object.assign(
        new Error("Cannot find package 'pkg' imported from /host"),
        { code: "ERR_MODULE_NOT_FOUND" },
      );

      async function setup() {
        let outcome: DocumentModelModule[] | Error = [alpha, beta];
        const fire: (() => void)[] = [];
        const loader: ISubscribablePackageLoader = {
          name: "fake-loader",
          loadDocumentModels: (pkg) =>
            pkg !== "pkg"
              ? Promise.resolve([])
              : outcome instanceof Error
                ? Promise.reject(outcome)
                : Promise.resolve(outcome),
          loadSubgraphs: (pkg) =>
            Promise.resolve(pkg === "other" ? [BetaStandIn] : []),
          loadProcessors: () => Promise.resolve(null),
          loadPieces: () => Promise.resolve([]),
          onDocumentModelsChange: (pkg, handler) => {
            if (pkg === "pkg") fire.push(() => handler([]));
            return () => {};
          },
        };
        const pkgManager = new PackageManager([loader], {
          packages: ["pkg", "other"],
        });
        const { documentModels, subgraphs } = await pkgManager.init();
        const registry = new DocumentModelRegistry();
        registry.registerModules(...documentModels);
        const harness = makeHarness({
          reactorClient: makeMockReactorClient({
            getDocumentModelModules: vi.fn(() =>
              Promise.resolve({
                results: registry.getAllModules(),
                options: { cursor: "", limit: 100 },
              }),
            ),
          }),
          enableDocumentModelSubgraphs: true,
        });
        setupEventListeners(
          pkgManager,
          harness.manager,
          {
            registerFactory: vi.fn(),
            unregisterFactory: vi.fn(),
          } as unknown as Parameters<typeof setupEventListeners>[2],
          () => ({}) as IProcessorHostModule,
          registry,
          { logger: silentLogger },
        );
        await initAndFlush(harness.manager);
        await harness.manager.applyPackageSubgraphs(subgraphs);
        await vi.runAllTimersAsync();
        expect(harness.manager.getSubgraphByName("beta")).toBeInstanceOf(
          DocumentModelSubgraph,
        );

        const registeredTypes = () =>
          registry.getAllModules().map((m) => m.documentModel.global.id);
        return {
          ...harness,
          pkgManager,
          registeredTypes,
          setOutcome: (next: DocumentModelModule[] | Error) => {
            outcome = next;
          },
          // A file under the package's document-models/ changed.
          documentModelsChanged: async () => {
            for (const handler of fire) handler();
            await vi.runAllTimersAsync();
          },
          reloadConfig: async (packages: string[]) => {
            await (
              pkgManager as unknown as {
                loadPackages(packages: string[]): Promise<unknown>;
              }
            ).loadPackages(packages);
            await vi.runAllTimersAsync();
          },
        };
      }

      type Harness = Awaited<ReturnType<typeof setup>>;

      function expectPackageGone(harness: Harness, modelRoute: unknown) {
        const { manager, disposed, gatewayAdapter, registeredTypes } = harness;
        expect(registeredTypes()).not.toContain("test/alpha");
        expect(registeredTypes()).not.toContain("test/beta");
        expect(disposed).toContain(modelRoute);
        expect(manager.getSubgraphByName("beta")).toBeInstanceOf(BetaStandIn);
        expect(manager.hasSubgraphHandler("beta")).toBe(true);
        const typeNames = supergraphTypeNames(gatewayAdapter);
        expect(typeNames).not.toContain("Alpha");
        expect(typeNames).not.toContain("Beta");
      }

      it("unregisters the models of a removed package", async () => {
        const harness = await setup();
        const modelRoute = harness.handles.get("/graphql/beta");

        harness.pkgManager.removePackage("pkg");
        await vi.runAllTimersAsync();

        expectPackageGone(harness, modelRoute);
      });

      it.each([
        ["has no models left", []],
        ["is no longer found", missing],
      ])(
        "unregisters the models of a package that %s",
        async (_, outcome: DocumentModelModule[] | Error) => {
          const harness = await setup();
          const modelRoute = harness.handles.get("/graphql/beta");

          harness.setOutcome(outcome);
          await harness.documentModelsChanged();

          expect(harness.pkgManager.getDocumentModels().has("pkg")).toBe(false);
          expectPackageGone(harness, modelRoute);
        },
      );

      it("unregisters the models of a package dropped from the config", async () => {
        const harness = await setup();
        const modelRoute = harness.handles.get("/graphql/beta");

        await harness.reloadConfig(["other"]);

        expectPackageGone(harness, modelRoute);
      });

      it.each([
        ["on a change", (h: Harness) => h.documentModelsChanged()],
        [
          "on a config reload",
          (h: Harness) => h.reloadConfig(["pkg", "other"]),
        ],
      ])(
        "keeps the last good models of a package that fails to load %s",
        async (_, reload: (h: Harness) => Promise<void>) => {
          const harness = await setup();

          harness.setOutcome(new Error("Transform failed with 1 error"));
          await reload(harness);

          expect(
            harness.pkgManager
              .getDocumentModels()
              .get("pkg")
              ?.map((m) => m.documentModel.global.id),
          ).toEqual(["test/alpha", "test/beta"]);
          expect(harness.registeredTypes()).toEqual(
            expect.arrayContaining(["test/alpha", "test/beta"]),
          );
          expect(harness.manager.getSubgraphByName("beta")).toBeInstanceOf(
            DocumentModelSubgraph,
          );
        },
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

  describe("reportError", () => {
    it("receives a failed supergraph update", async () => {
      const reportError = vi.fn();
      const { manager, gatewayAdapter } = makeHarness({ reportError });
      await initAndFlush(manager);
      const failure = new Error("composition failed");
      gatewayAdapter.updateSupergraph.mockRejectedValueOnce(failure);

      const update = manager.updateRouter();
      await vi.runAllTimersAsync();
      await update;

      expect(reportError).toHaveBeenCalledExactlyOnceWith(failure);
    });

    it("receives a failed router update scheduled by a package change", async () => {
      const reportError = vi.fn();
      const { manager } = makeHarness({ reportError });
      await initAndFlush(manager);
      const failure = new Error("router update failed");
      manager.updateRouter = vi.fn(() => Promise.reject(failure));
      class Widget extends sdlBase("type Query { widget: String }") {
        static override readonly subgraphName = "widget";
      }

      await manager.applyPackageSubgraphs(new Map([["pkg", [Widget]]]));
      await vi.runAllTimersAsync();

      expect(reportError).toHaveBeenCalledExactlyOnceWith(failure);
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
    ): [SubgraphClass, string[]] {
      const disconnected: string[] = [];
      const typeDefs = opts.subscriptions
        ? "type Query { ping: Boolean } type Subscription { pinged: Boolean }"
        : "type Query { ping: Boolean }";
      const Subgraph = class extends sdlBase(typeDefs, {
        Query: { ping: () => true },
      }) {
        static override readonly subgraphName = name;
        override onDisconnect = (): Promise<void> => {
          disconnected.push(name);
          return Promise.resolve();
        };
      };
      return [Subgraph, disconnected];
    }

    async function flushRouter(manager: GraphQLManager): Promise<void> {
      const p = manager.updateRouter();
      await vi.runAllTimersAsync();
      await p;
    }

    it("unregisterPackage unmounts routes and removes all subgraph state", async () => {
      const { manager, mounts, handles, gatewayAdapter } = makeHarness();
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
      const { manager, handles } = makeHarness();
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
      const { manager, mounts, handles } = makeHarness();
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
      class CapturingSubgraph extends sdlBase(
        "type Query { captured: String }",
      ) {
        static override readonly subgraphName = "capturing";
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
    class EvilSubgraph extends PublishedBaseSubgraph {
      override name = "evil";
      override path = "/";
      override typeDefs = gql`
        type Query {
          evil: String
        }
      `;
      override resolvers = {};
    }

    it("mounts an old-style subgraph under the manager's base path even when its `path` initializer overwrote the injected value", async () => {
      const { manager, httpAdapter } = makeHarness({ path: "/ph" });
      await initAndFlush(manager);

      const instance = (await manager.registerSubgraph(
        EvilSubgraph as unknown as SubgraphClass,
        "graphql",
      )) as PublishedBaseSubgraph | undefined;
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

    it("ignores an old-style plain-object subgraph's `path` for routing", async () => {
      const { manager, httpAdapter } = makeHarness({ path: "/ph" });
      await initAndFlush(manager);

      const oldStyle = {
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
      };
      await manager.registerSubgraphInstance(oldStyle as never, "graphql");
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

    function makePlainSub(name: string) {
      return sdlInstance(name, "type Query { hi: String }");
    }

    class SystemSubgraph extends sdlBase("type Query { systemInfo: String }") {
      static override readonly subgraphName = "system";
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

      const buckets = bucketInstances(manager);
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

      class CoreSubgraph extends sdlBase("type Query { hello: String }") {
        static override readonly subgraphName = "early";
      }
      await initAndFlush(manager, [CoreSubgraph]);

      expect(manager.getSubgraphByName("early")).toBeInstanceOf(CoreSubgraph);
      for (const bucket of bucketInstances(manager).values()) {
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

    class LateCore extends sdlBase("type Query { lateCore: String }") {
      static override readonly subgraphName = "late";
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
      for (const bucket of bucketInstances(manager).values()) {
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
    const reactorDriveModelSubgraphName = getDocumentModelSubgraphName(
      reactorDriveModel.documentModel.global,
    );

    function makeHostReactorDriveSubgraph(
      name = REACTOR_DRIVE_SUBGRAPH_NAME,
    ): BaseSubgraph {
      return sdlInstance(
        name,
        reactorDriveSubgraphTypeDefs,
        createReactorDriveResolvers({
          hostCanRead: () => Promise.resolve(true),
        }),
      );
    }

    const widgetStockTypeDefs = gql`
      type Widget {
        inventory: Int!
      }
      type Query {
        widgetStock: Widget
      }
    `;

    function makeWidgetSubgraph(
      name = "widget-stock",
      hooks: SubgraphHooks = {},
    ): BaseSubgraph {
      return sdlInstance(name, widgetStockTypeDefs, {}, hooks);
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
      class Privacy extends sdlBase("type Query { privacy: String }") {
        static override readonly subgraphName = "privacy";
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
      class Shared extends sdlBase("type Query { shared: String }") {
        static override readonly subgraphName = "shared";
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
      class FooA extends sdlBase("type Query { foo: String }") {
        static override readonly subgraphName = "foo";
      }
      class FooB extends sdlBase("type Query { foo: String }") {
        static override readonly subgraphName = "foo";
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
      class FooA extends sdlBase("type Query { foo: String }") {
        static override readonly subgraphName = "foo";
      }
      class FooB extends sdlBase("type Query { foo: String }") {
        static override readonly subgraphName = "foo";
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

      class V1 extends sdlBase("type Query { sharedName: String }") {
        static override readonly subgraphName = "shared-name";
      }
      class V2 extends sdlBase("type Query { sharedName: String }") {
        static override readonly subgraphName = "shared-name";
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

      class Squatter extends sdlBase("type Query { squatter: String }") {
        static override readonly subgraphName = reactorDriveModelSubgraphName;
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

    it("logs a package subgraph's type collision once across restores", async () => {
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
      const created = vi.fn();
      class Collider extends sdlBase(widgetStockTypeDefs) {
        static override readonly subgraphName = "collider";
        constructor(...args: ConstructorParameters<typeof BaseSubgraph>) {
          super(...args);
          created();
        }
      }
      class Foo extends sdlBase("type Query { foo: String }") {
        static override readonly subgraphName = "foo";
      }
      class Bar extends sdlBase("type Query { bar: String }") {
        static override readonly subgraphName = "bar";
      }
      await manager.applyPackageSubgraphs(
        new Map<string, SubgraphClass[]>([
          ["pkg", [Collider]],
          ["other", [Foo, Bar]],
        ]),
      );

      // Each frees a name, so each restores.
      await flush(manager.prunePackageSubgraphs("other", new Set(["foo"])));
      await flush(manager.prunePackageSubgraphs("other", new Set()));

      expect(manager.getSubgraphByName("collider")).toBeUndefined();
      const refusals = vi
        .mocked(logger.error)
        .mock.calls.filter(
          ([message, name]) =>
            message === "Rejecting subgraph @name: @error" &&
            name === "collider",
        );
      expect(refusals).toHaveLength(1);
      expect(created).toHaveBeenCalledTimes(1);
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
        sdlInstance(
          "prefixed-squatter",
          `
            type ${prefixed} {
              squatted: String
            }
            type Query {
              squat: ${prefixed}
            }
          `,
        ),
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
      class FooA extends sdlBase("type Query { foo: String }") {
        static override readonly subgraphName = "foo";
      }
      class FooB extends sdlBase("type Query { foo: String }") {
        static override readonly subgraphName = "foo";
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
      class FooA extends sdlBase("type Query { foo: String }") {
        static override readonly subgraphName = "foo";
      }
      class BarA extends sdlBase("type Query { bar: String }") {
        static override readonly subgraphName = "bar";
      }
      class FooB extends sdlBase("type Query { foo: String }") {
        static override readonly subgraphName = "foo";
      }

      await manager.applyPackageSubgraphs(new Map([["a", [FooA, BarA]]]));
      await manager.applyPackageSubgraphs(
        new Map<string, SubgraphClass[]>([
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
      class Squatter extends sdlBase("type Query { squatter: String }") {
        static override readonly subgraphName = reactorDriveModelSubgraphName;
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
      class Owned extends sdlBase("type Query { owned: String }") {
        static override readonly subgraphName = "owned";
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
      const root = makeWidgetSubgraph("twin", { onDisconnect: rootDisconnect });
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
      class Twin extends sdlBase("type Query { twin: String }") {
        static override readonly subgraphName = "twin";
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
        subgraphs: Map<string, HostedSubgraph[]>;
      };
      return new Set(
        Array.from(subgraphs.values())
          .flat()
          .filter((record) => record.name === name)
          .map((record) => record.instance),
      );
    }

    it("tears down a package registered at boot when a change no longer holds it", async () => {
      const { manager } = makeHarness();
      await initAndFlush(manager);
      const [AlphaA, alphaDisconnected] = (() => {
        const disconnected: string[] = [];
        class Alpha extends sdlBase("type Query { alpha: String }") {
          static override readonly subgraphName = "alpha";
          override onDisconnect = () => {
            disconnected.push("alpha");
            return Promise.resolve();
          };
        }
        return [Alpha, disconnected] as const;
      })();
      class BetaB extends sdlBase("type Query { beta: String }") {
        static override readonly subgraphName = "beta";
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
      class Squatter extends sdlBase("type Query { squatter: String }") {
        static override readonly subgraphName = reactorDriveModelSubgraphName;
        override onSetup = () =>
          new Promise<void>((resolve) => setTimeout(resolve, 5));
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
      class Squatter extends sdlBase("type Query { squatter: String }") {
        static override readonly subgraphName = reactorDriveModelSubgraphName;
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
      class Squatter extends sdlBase("type Query { squatter: String }") {
        static override readonly subgraphName = reactorDriveModelSubgraphName;
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
      class Inner extends sdlBase("type Query { inner: String }") {
        static override readonly subgraphName = "inner";
      }
      class Outer extends sdlBase("type Query { outer: String }") {
        static override readonly subgraphName = "outer";
        override onSetup = async () => {
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
      let detached: Promise<BaseSubgraph | undefined> | undefined;
      let timerFired!: () => void;
      const fired = new Promise<void>((resolve) => {
        timerFired = resolve;
      });
      class Starter extends sdlBase("type Query { starter: String }") {
        static override readonly subgraphName = "starter";
        override onSetup = () => {
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
      class Blocker extends sdlBase("type Query { blocker: String }") {
        static override readonly subgraphName = "blocker";
        override onSetup = () => gate;
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

    it("queues a registration a hook's timer makes while a later hook of the same change runs", async () => {
      const { manager } = makeHarness();
      await initAndFlush(manager);
      // Faked timers fire in the caller's async context and would hide the leak.
      vi.useRealTimers();

      const detachedSubgraph = makeWidgetSubgraph("detached");
      let detached: Promise<BaseSubgraph | undefined> | undefined;
      let timerFired!: () => void;
      const fired = new Promise<void>((resolve) => {
        timerFired = resolve;
      });
      class Starter extends sdlBase("type Query { starter: String }") {
        static override readonly subgraphName = "starter";
        override onSetup = () => {
          setTimeout(() => {
            detached = this.graphqlManager.registerSubgraphInstance(
              detachedSubgraph,
              "graphql",
            );
            timerFired();
          }, 0);
          return Promise.resolve();
        };
      }
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      class Blocker extends sdlBase("type Query { blocker: String }") {
        static override readonly subgraphName = "blocker";
        override onSetup = () => gate;
      }

      const change = manager.applyPackageSubgraphs(
        new Map<string, SubgraphClass[]>([
          ["a", [Starter]],
          ["b", [Blocker]],
        ]),
      );
      await fired;
      await new Promise((resolve) => setImmediate(resolve));

      expect(detached).toBeDefined();
      expect(manager.getSubgraphByName("detached")).toBeUndefined();

      release();
      await change;
      expect(await detached).toBe(detachedSubgraph);
    });

    it("keeps a lower-ranked holder when the subgraph evicting it fails to set up", async () => {
      const logger = makeHarnessLogger();
      const { manager } = makeHarness({ logger });
      await initAndFlush(manager);
      class Shared extends sdlBase("type Query { shared: String }") {
        static override readonly subgraphName = "shared";
      }
      await manager.applyPackageSubgraphs(new Map([["pkg", [Shared]]]));
      const held = manager.getSubgraphByName("shared");
      const failing = makeWidgetSubgraph("shared", {
        onSetup: () => Promise.reject(new Error("setup failed")),
      });

      await expect(
        manager.registerSubgraphInstance(failing, "graphql"),
      ).rejects.toThrow("setup failed");

      expect(manager.getSubgraphByName("shared")).toBe(held);
      expect(logger.error).not.toHaveBeenCalledWith(
        EVICTION,
        "shared",
        "package pkg",
        "the host",
      );
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

      const buckets = bucketInstances(manager);
      expect(buckets.get("extra")).toEqual([sub]);
      expect(buckets.get("graphql")).toEqual([sub]);
    });
  });

  describe("core types take precedence over document models", () => {
    const CORE = ["r", "system"];
    const REFUSAL =
      "Refusing every version of document model @documentType from the GraphQL schema: @reason";

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
      return getDocumentModelSubgraphName(model.documentModel.global);
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

  describe("type and root-field ownership", () => {
    const CLAIM_EXCLUSION =
      "Excluding subgraph @name from the supergraph: @error";

    async function flush<T>(pending: Promise<T>): Promise<T> {
      await vi.runAllTimersAsync();
      return pending;
    }

    function supergraphNames(
      gatewayAdapter: ReturnType<typeof makeHarness>["gatewayAdapter"],
    ): string[] {
      const getDefinitions = gatewayAdapter.createSupergraphHandler.mock
        .calls[0][0] as () => { name: string }[];
      return getDefinitions().map((d) => d.name.replace(":graphql/", ""));
    }

    /** The subgraphs logged as losing a claim, once per log line. */
    function claimExclusions(logger: ILogger): string[] {
      return vi
        .mocked(logger.error)
        .mock.calls.filter(
          ([message, , reason]) =>
            message === CLAIM_EXCLUSION &&
            String(reason).includes("claims owned by another subgraph"),
        )
        .map(([, name]) => String(name));
    }

    const widget = gql`
      type Widget {
        id: ID!
        name: String
      }
      type Query {
        widget: Widget
      }
    `;
    const widgetSubset = gql`
      type Widget {
        id: ID!
      }
      type Query {
        widgetById: Widget
      }
    `;

    function makeOwnershipHarness(models?: DocumentModelModule[]) {
      const logger = makeHarnessLogger();
      return {
        logger,
        ...makeHarness({
          logger,
          enableDocumentModelSubgraphs: models !== undefined,
          reactorClient: models
            ? makeMockReactorClient({
                getDocumentModelModules: vi
                  .fn()
                  .mockResolvedValue({ results: models }),
              })
            : undefined,
        }),
      };
    }

    async function applyPackages(
      manager: GraphQLManager,
      packages: [string, SubgraphClass[]][],
    ) {
      await flush(manager.applyPackageSubgraphs(new Map(packages)));
      await flush(manager.updateRouter());
    }

    function expectRouteKept(
      harness: ReturnType<typeof makeOwnershipHarness>,
      name: string,
    ) {
      const route = harness.handles.get(`/graphql/${name}`);
      expect(route).toBeDefined();
      expect(route?.dispose).not.toHaveBeenCalled();
      expect(harness.manager.hasSubgraphHandler(name)).toBe(true);
    }

    it("serves every model subgraph's Revision beside the reactor subgraph's", async () => {
      const harness = makeOwnershipHarness([
        makeDriveModule(),
        makeModelModule("TodoList", "test/todo-list"),
        makeModelModule("Invoice", "test/invoice"),
      ]);
      await initAndFlush(harness.manager, [ReactorSubgraph]);

      expect(supergraphNames(harness.gatewayAdapter)).toEqual(
        expect.arrayContaining(["r", "todo-list", "invoice"]),
      );
      expect(claimExclusions(harness.logger)).toEqual([]);
    });

    it("excludes a subgraph defining a subset of an owned type, keeping its route", async () => {
      const harness = makeOwnershipHarness();
      await initAndFlush(harness.manager);
      await applyPackages(harness.manager, [
        ["pkg-a", [sdlSubgraph("widget-a", widget)]],
        ["pkg-b", [sdlSubgraph("widget-b", widgetSubset)]],
      ]);
      await flush(harness.manager.updateRouter());

      const names = supergraphNames(harness.gatewayAdapter);
      expect(names).toContain("widget-a");
      expect(names).not.toContain("widget-b");
      expectRouteKept(harness, "widget-b");
      expect(claimExclusions(harness.logger)).toEqual(["widget-b"]);
      expect(vi.mocked(harness.logger.error)).toHaveBeenCalledWith(
        CLAIM_EXCLUSION,
        "widget-b",
        expect.stringContaining('Widget (owned by "widget-a")'),
      );
    });

    it("gives Query.documents to the first package claiming it", async () => {
      const harness = makeOwnershipHarness();
      await initAndFlush(harness.manager);
      await applyPackages(harness.manager, [
        [
          "pkg-a",
          [
            sdlSubgraph(
              "docs-a",
              gql`
                type Query {
                  documents(limit: Int): [String!]!
                }
              `,
            ),
          ],
        ],
        [
          "pkg-b",
          [
            sdlSubgraph(
              "docs-b",
              gql`
                type Query {
                  documents: [String!]!
                }
              `,
            ),
          ],
        ],
      ]);

      const names = supergraphNames(harness.gatewayAdapter);
      expect(names).toContain("docs-a");
      expect(names).not.toContain("docs-b");
      expect(vi.mocked(harness.logger.error)).toHaveBeenCalledWith(
        CLAIM_EXCLUSION,
        "docs-b",
        expect.stringContaining('Query.documents (owned by "docs-a")'),
      );
    });

    it("excludes a subgraph extending a type another subgraph defines", async () => {
      const harness = makeOwnershipHarness();
      await initAndFlush(harness.manager);
      await applyPackages(harness.manager, [
        ["pkg-a", [sdlSubgraph("widget-a", widget)]],
        [
          "pkg-b",
          [
            sdlSubgraph(
              "widget-extra",
              gql`
                extend type Widget {
                  extra: String
                }
              `,
            ),
          ],
        ],
      ]);

      const names = supergraphNames(harness.gatewayAdapter);
      expect(names).toContain("widget-a");
      expect(names).not.toContain("widget-extra");
    });

    it("keeps the reactor subgraph's PagingInput over a package's", async () => {
      const harness = makeOwnershipHarness();
      await initAndFlush(harness.manager, [ReactorSubgraph]);
      await applyPackages(harness.manager, [
        [
          "pkg",
          [
            sdlSubgraph(
              "paging",
              gql`
                input PagingInput {
                  limit: Int
                  offset: Int
                }
                type Query {
                  things(paging: PagingInput): [String!]!
                }
              `,
            ),
          ],
        ],
      ]);

      const names = supergraphNames(harness.gatewayAdapter);
      expect(names).toContain("r");
      expect(names).not.toContain("paging");
      expectRouteKept(harness, "paging");
      expect(vi.mocked(harness.logger.error)).toHaveBeenCalledWith(
        CLAIM_EXCLUSION,
        "paging",
        expect.stringContaining('PagingInput (owned by "r")'),
      );
    });

    it("ranks the host over a package registered before it", async () => {
      const harness = makeOwnershipHarness();
      await initAndFlush(harness.manager);
      await applyPackages(harness.manager, [
        ["pkg", [sdlSubgraph("widget-pkg", widgetSubset)]],
      ]);
      await harness.manager.registerSubgraph(
        sdlSubgraph("widget-host", widget),
        "graphql",
      );
      await flush(harness.manager.updateRouter());

      const names = supergraphNames(harness.gatewayAdapter);
      expect(names).toContain("widget-host");
      expect(names).not.toContain("widget-pkg");
    });

    it("keeps the owner when the packages reload in another order", async () => {
      const harness = makeOwnershipHarness();
      await initAndFlush(harness.manager);
      const packageA: [string, SubgraphClass[]] = [
        "pkg-a",
        [sdlSubgraph("widget-a", widget)],
      ];
      const packageB: [string, SubgraphClass[]] = [
        "pkg-b",
        [sdlSubgraph("widget-b", widgetSubset)],
      ];
      await applyPackages(harness.manager, [packageA, packageB]);

      // As an HMR reload does: new instances, the loser registered first.
      await applyPackages(harness.manager, [packageB, packageA]);

      const names = supergraphNames(harness.gatewayAdapter);
      expect(names).toContain("widget-a");
      expect(names).not.toContain("widget-b");
      expect(new Set(claimExclusions(harness.logger))).toEqual(
        new Set(["widget-b"]),
      );
    });

    it("serves the loser once the owner's package is removed", async () => {
      const harness = makeOwnershipHarness();
      await initAndFlush(harness.manager);
      await applyPackages(harness.manager, [
        ["pkg-a", [sdlSubgraph("widget-a", widget)]],
        ["pkg-b", [sdlSubgraph("widget-b", widgetSubset)]],
      ]);
      expect(supergraphNames(harness.gatewayAdapter)).not.toContain("widget-b");

      await flush(harness.manager.unregisterPackage("pkg-a"));

      const names = supergraphNames(harness.gatewayAdapter);
      expect(names).not.toContain("widget-a");
      expect(names).toContain("widget-b");
    });

    it("excludes the loser from the supergraph stream", async () => {
      const harness = makeOwnershipHarness();
      await initAndFlush(harness.manager);
      const streamed = (
        subgraphName: string,
        field: string,
        widgetSdl: string,
      ): SubgraphClass =>
        sdlSubgraph(
          subgraphName,
          `${widgetSdl}
            type Query { ${field}Info: String }
            type Subscription { ${field}: Widget }`,
          {
            Subscription: {
              [field]: {
                subscribe: async function* () {
                  await Promise.resolve();
                  yield { [field]: { id: subgraphName } };
                },
              },
            },
          },
        );
      await applyPackages(harness.manager, [
        [
          "pkg-a",
          [
            streamed(
              "stream-a",
              "widgetA",
              "type Widget { id: ID! name: String }",
            ),
          ],
        ],
        ["pkg-b", [streamed("stream-b", "widgetB", "type Widget { id: ID! }")]],
      ]);
      vi.useRealTimers();

      const handler = harness.mounts.get("/graphql/stream");
      expect(handler).toBeDefined();
      const res = await handler!(
        new Request("http://localhost/graphql/stream", {
          method: "POST",
          headers: {
            accept: "text/event-stream",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            query: '{ __type(name: "Subscription") { fields { name } } }',
          }),
        }),
      );
      const events = await res.text();
      expect(events).toContain('{"name":"widgetA"}');
      expect(events).not.toContain('{"name":"widgetB"}');
      expectRouteKept(harness, "stream-b");
    });

    it("keeps a model's Queries type for its own subgraph over a codegen custom subgraph", async () => {
      const harness = makeOwnershipHarness([
        makeDriveModule(),
        makeModelModule("TodoList", "test/todo-list"),
      ]);
      await initAndFlush(harness.manager, [ReactorSubgraph]);
      // The `ph generate --subgraph` template.
      await applyPackages(harness.manager, [
        [
          "pkg",
          [
            sdlSubgraph(
              "todo-list-custom",
              gql`
                """
                TodoList Queries
                """
                type TodoListQueries {
                  example(driveId: String!): String
                }

                type Query {
                  todoList: TodoListQueries!
                }
              `,
            ),
          ],
        ],
      ]);

      const names = supergraphNames(harness.gatewayAdapter);
      expect(names).toContain("todo-list");
      expect(names).not.toContain("todo-list-custom");
      expectRouteKept(harness, "todo-list-custom");
      expect(vi.mocked(harness.logger.error)).toHaveBeenCalledWith(
        CLAIM_EXCLUSION,
        "todo-list-custom",
        expect.stringContaining('TodoListQueries (owned by "todo-list")'),
      );

      // As editing the model in Vetra does.
      await flush(harness.manager.regenerateDocumentModelSubgraphs());
      await flush(harness.manager.updateRouter());

      const reloaded = supergraphNames(harness.gatewayAdapter);
      expect(reloaded).toContain("todo-list");
      expect(reloaded).not.toContain("todo-list-custom");
    });

    it("serves an identical root field from its owner only", async () => {
      const harness = makeOwnershipHarness();
      await initAndFlush(harness.manager);
      const documentSubgraph = (subgraphName: string): SubgraphClass =>
        sdlSubgraph(
          subgraphName,
          `
            type Query {
              document(id: String!): String
            }
            type Subscription {
              ${subgraphName.replace("-", "")}: String
            }
          `,
          {
            Query: { document: () => subgraphName },
            Subscription: {},
          },
        );
      await harness.manager.registerSubgraph(
        documentSubgraph("doc-host"),
        "graphql",
      );
      // Lower-ranked and registered last, so a last-wins merge would pick it.
      await applyPackages(harness.manager, [
        ["pkg", [documentSubgraph("doc-pkg")]],
      ]);
      vi.useRealTimers();

      const names = supergraphNames(harness.gatewayAdapter);
      expect(names).toContain("doc-host");
      expect(names).not.toContain("doc-pkg");
      expectRouteKept(harness, "doc-pkg");
      const handler = harness.mounts.get("/graphql/stream");
      expect(handler).toBeDefined();
      const res = await handler!(
        new Request("http://localhost/graphql/stream", {
          method: "POST",
          headers: {
            accept: "text/event-stream",
            "content-type": "application/json",
          },
          body: JSON.stringify({ query: '{ document(id: "x") }' }),
        }),
      );
      expect(await res.text()).toContain('{"data":{"document":"doc-host"}}');
    });

    it("lets a subgraph whose schema cannot build claim nothing", async () => {
      const harness = makeOwnershipHarness();
      await initAndFlush(harness.manager);
      await applyPackages(harness.manager, [
        [
          "pkg-a",
          [
            sdlSubgraph(
              "widget-broken",
              gql`
                type Widget {
                  id: ID!
                  part: NoSuchType
                }
                type Query {
                  brokenWidget: Widget
                }
              `,
            ),
          ],
        ],
        ["pkg-b", [sdlSubgraph("widget-b", widgetSubset)]],
      ]);

      expect(harness.manager.hasSubgraphHandler("widget-broken")).toBe(false);
      expect(supergraphNames(harness.gatewayAdapter)).toContain("widget-b");
      expect(claimExclusions(harness.logger)).toEqual([]);
    });

    it("lets a refused model's subgraph claim nothing", async () => {
      const harness = makeOwnershipHarness([
        makeDriveModule(),
        makeModelModule("Revision", "test/revision"),
      ]);
      await initAndFlush(harness.manager, [ReactorSubgraph]);
      await applyPackages(harness.manager, [
        [
          "pkg",
          [
            sdlSubgraph(
              "revision-custom",
              gql`
                type RevisionQueries {
                  example: String
                }
                type Query {
                  Revision: RevisionQueries
                }
              `,
            ),
          ],
        ],
      ]);

      expect(harness.manager.getSubgraphByName("revision")).toBeUndefined();
      expect(supergraphNames(harness.gatewayAdapter)).toContain(
        "revision-custom",
      );
      expect(claimExclusions(harness.logger)).toEqual([]);
    });

    it("excludes nothing among the real core subgraphs and base models", async () => {
      const harness = makeOwnershipHarness([
        driveDocumentModelModule,
        documentModelDocumentModelModule,
        reactorDriveDocumentModelModule,
      ] as unknown as DocumentModelModule[]);
      await initAndFlush(harness.manager, [
        AnalyticsSubgraph,
        ReactorSubgraph,
        SystemSubgraph,
        AuthSubgraph,
      ]);

      expect(claimExclusions(harness.logger)).toEqual([]);
      expect(supergraphNames(harness.gatewayAdapter)).toEqual(
        expect.arrayContaining(["analytics", "r", "system", "auth"]),
      );
    });
  });
});
