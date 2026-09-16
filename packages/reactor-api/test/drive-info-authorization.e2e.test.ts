import type { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import type {
  IReactorClient,
  IRelationalDb,
  ISyncManager,
} from "@powerhousedao/reactor";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";
import type http from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WebSocketServer } from "ws";
import { ExpressHttpAdapter } from "../src/graphql/gateway/adapter-http-express.js";
import { createAuthFetchMiddleware } from "../src/graphql/gateway/auth-middleware.js";
import type {
  IGatewayAdapter,
  WsDisposer,
} from "../src/graphql/gateway/types.js";
import { GraphQLManager } from "../src/graphql/graphql-manager.js";
import type { Context } from "../src/graphql/types.js";
import type { AuthService } from "../src/services/auth.service.js";
import type { IAuthorizationService } from "../src/services/authorization.service.js";
import {
  AuthorizationPolicy,
  createAuthorizationService,
} from "../src/services/authorization.service.js";

/**
 * End-to-end tests for the drive info endpoint's authorization gate.
 *
 * Unlike `graphql-manager.test.ts`, which invokes the mounted FetchHandler
 * directly against a mock adapter, these drive a real `ExpressHttpAdapter`
 * listening on a real port and issue real HTTP requests. That is the only way
 * to cover the whole path a deployed switchboard actually serves: the express
 * router's dispatch order, the auth middleware resolving a bearer off real
 * headers, and the response the wire finally carries.
 *
 * The endpoint returns a drive's id, slug, name, icon and meta. Before the
 * authorization gate it was mounted raw — outside every middleware — so any
 * anonymous caller could read all of it from any switchboard.
 */

const ADMIN = "0xadmin";
const OUTSIDER = "0xoutsider";

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

function makeReactorClient(): IReactorClient {
  return {
    getDocumentModelModules: vi
      .fn()
      .mockResolvedValue({ results: [makeDriveModule()] }),
    get: vi.fn((identifier: string) => {
      if (identifier !== "my-drive" && identifier !== "drive-1") {
        return Promise.reject(new Error("not found"));
      }
      return Promise.resolve({
        header: { id: "drive-1", slug: "my-drive", meta: { tag: "secret" } },
        state: { global: { name: "Test Drive", icon: "icon.png" } },
      });
    }),
    find: vi
      .fn()
      .mockResolvedValue({ results: [], options: { cursor: "", limit: 100 } }),
  } as unknown as IReactorClient;
}

function makeGatewayAdapter(): IGatewayAdapter<Context> {
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
  } as unknown as IGatewayAdapter<Context>;
}

/**
 * Stands in for AuthService at its published contract: the bearer token IS
 * the caller's address, and a token that is not a `Bearer <address>` is a
 * 401 — the same answer the real service gives an unverifiable credential.
 *
 * Minting a real Renown JWT here would test the credential verifier, which
 * `auth.service.test.ts` already owns. What this suite needs from auth is
 * only that a header on a real HTTP request becomes a caller the gate can
 * act on, so the token→identity step is the seam worth stubbing.
 */
function makeAuthService(): AuthService {
  return {
    authenticateRequest: (request: globalThis.Request) => {
      const authorization = request.headers.get("authorization");
      if (!authorization) {
        return Promise.resolve({
          user: undefined,
          admins: [ADMIN],
          auth_enabled: true,
        });
      }
      const [scheme, token] = authorization.split(" ");
      if (scheme !== "Bearer" || !token) {
        return Promise.resolve(
          new Response(JSON.stringify({ error: "Verification failed" }), {
            status: 401,
          }),
        );
      }
      return Promise.resolve({
        user: {
          address: token,
          chainId: 1,
          networkId: "mainnet",
          appKey: `did:key:z${token}`,
        },
        admins: [ADMIN],
        auth_enabled: true,
      });
    },
  } as unknown as AuthService;
}

type ServerHandle = {
  port: number;
  close: () => Promise<void>;
};

const openServers: ServerHandle[] = [];

async function startServer(
  authorizationService: IAuthorizationService,
  { withAuth = true }: { withAuth?: boolean } = {},
): Promise<ServerHandle> {
  const httpAdapter = new ExpressHttpAdapter();
  const server = await httpAdapter.listen(0);
  const { port } = server.address() as { port: number };

  const manager = new GraphQLManager(
    "/",
    server,
    {
      close: vi.fn((cb?: () => void) => cb?.()),
      setMaxListeners: vi.fn(),
    } as unknown as WebSocketServer,
    makeReactorClient(),
    {} as IRelationalDb,
    {} as IAnalyticsStore,
    {} as ISyncManager,
    silentLogger,
    httpAdapter,
    makeGatewayAdapter(),
    undefined,
    undefined,
    { enableDocumentModelSubgraphs: false },
    port,
    authorizationService,
  );

  await manager.init(
    [],
    withAuth ? createAuthFetchMiddleware(makeAuthService()) : undefined,
    undefined,
  );

  const handle: ServerHandle = {
    port,
    close: () =>
      new Promise<void>((resolve, reject) =>
        (server as http.Server).close((err) => (err ? reject(err) : resolve())),
      ),
  };
  openServers.push(handle);
  return handle;
}

function adminOnly(): IAuthorizationService {
  return createAuthorizationService({
    admins: [ADMIN],
    defaultProtection: false,
    policy: AuthorizationPolicy.ADMIN_ONLY,
  });
}

function open(): IAuthorizationService {
  return createAuthorizationService({
    admins: [],
    defaultProtection: false,
    policy: AuthorizationPolicy.OPEN,
  });
}

function get(port: number, path: string, bearer?: string) {
  return fetch(`http://127.0.0.1:${port}${path}`, {
    headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
  });
}

describe("drive info endpoint authorization (e2e over real HTTP)", () => {
  afterEach(async () => {
    while (openServers.length > 0) {
      await openServers.pop()?.close();
    }
    vi.clearAllMocks();
  });

  it("withholds drive metadata from an anonymous caller when the policy denies the read", async () => {
    const { port } = await startServer(adminOnly());

    const res = await get(port, "/d/my-drive");

    expect(res.status).toBe(404);
    const body = (await res.json()) as Record<string, unknown>;
    // The leak this gate closes: id/slug/name/icon/meta must not be on the wire.
    expect(body).toEqual({ error: "Drive not found" });
  });

  it("serves an authorized caller who presents a bearer", async () => {
    const { port } = await startServer(adminOnly());

    const res = await get(port, "/d/my-drive", ADMIN);

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      slug: string;
      name: string;
      graphqlEndpoint: string;
    };
    expect(body.id).toBe("drive-1");
    expect(body.slug).toBe("my-drive");
    expect(body.name).toBe("Test Drive");
    expect(body.graphqlEndpoint).toContain("/graphql/r");
  });

  it("refuses an authenticated caller who is not authorized for the drive", async () => {
    const { port } = await startServer(adminOnly());

    const res = await get(port, "/d/my-drive", OUTSIDER);

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Drive not found" });
  });

  it("answers a refused drive exactly as it answers a missing one", async () => {
    // A distinguishable refusal (403, or a different body) would let an
    // unauthorized caller enumerate drives by probing slugs.
    const { port } = await startServer(adminOnly());

    const refused = await get(port, "/d/my-drive");
    const missing = await get(port, "/d/no-such-drive");

    expect(refused.status).toBe(missing.status);
    await expect(refused.json()).resolves.toEqual(await missing.json());
  });

  it("stays open to anonymous drive discovery under the OPEN policy", async () => {
    // Drive discovery is the one read a client makes before it can
    // authenticate: Connect reads graphqlEndpoint from here to register the
    // sync remote. An unauthenticated switchboard must keep answering, or
    // add-remote-drive can never bootstrap.
    const { port } = await startServer(open(), { withAuth: false });

    const res = await get(port, "/d/my-drive");

    expect(res.status).toBe(200);
    const body = (await res.json()) as { graphqlEndpoint: string };
    expect(body.graphqlEndpoint).toContain("/graphql/r");
  });

  it("rejects an invalid bearer before the drive is ever read", async () => {
    // Identity resolution runs ahead of the gate, so a bad token is a 401
    // from the auth middleware rather than a silent fallback to anonymous.
    const { port } = await startServer(adminOnly());

    const res = await fetch(`http://127.0.0.1:${port}/d/my-drive`, {
      headers: { authorization: "NotBearer nonsense" },
    });

    expect(res.status).toBe(401);
  });
});
