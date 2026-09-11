// WebSocket auth is decided once per connection, and every refusal closes 4403.

// graphql-ws runs `context` per operation, so a throw there lands after the ack.

// An escaping throw closes 4500, which the client's fatal list never retries.

// 4401 is equally fatal; 4403 is the only retryable code in the range.

// The rule is HTTP's: `ws` owns the upgrade, so the fetch gate never sees it.

// `websocket.ts` blanks `useServer` under Vitest; mocked back to the real one.

import { makeExecutableSchema } from "@graphql-tools/schema";
import { createServer, type Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocket, WebSocketServer } from "ws";

vi.mock("../../src/graphql/websocket.js", async () => ({
  useServer: (await import("graphql-ws/use/ws")).useServer,
}));

const mockVerifyAuthBearerToken = vi.fn();
vi.mock("@renown/sdk", () => ({
  verifyAuthBearerToken: (...args: unknown[]) =>
    mockVerifyAuthBearerToken(...args),
}));

const { createClient } = await import("graphql-ws");
const { AuthService } = await import("../../src/services/auth.service.js");
const { createWsAuthHandlers } =
  await import("../../src/graphql/graphql-manager.js");
const { ApolloGatewayAdapter } =
  await import("../../src/graphql/gateway/adapter-gateway-apollo.js");
const { MercuriusGatewayAdapter } =
  await import("../../src/graphql/gateway/adapter-gateway-mercurius.js");
const { StitchingGatewayAdapter } =
  await import("../../src/graphql/gateway/adapter-gateway-stitching.js");

import type { IGatewayAdapter } from "../../src/graphql/gateway/types.js";
import type { Context } from "../../src/graphql/types.js";

// ─── fixtures ────────────────────────────────────────────────────────────────

const ADMINS = ["0xadmin"];
const WS_PATH = "/graphql/subscriptions";

function makeVerified(address = "0xuser") {
  return {
    verifiableCredential: {
      credentialSubject: { address, chainId: 1, networkId: "eip155" },
    },
    issuer: "did:key:zApp",
  };
}

function makeLogger() {
  const logger = {
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

const ADAPTERS = {
  apollo: () => new ApolloGatewayAdapter(makeLogger()),
  mercurius: () => new MercuriusGatewayAdapter(makeLogger()),
  stitching: () => new StitchingGatewayAdapter(makeLogger()),
} as const;

/** Records the context it ran with: how anonymous is told from somebody. */
function makeSchema(seen: Context[]) {
  return makeExecutableSchema({
    typeDefs: `
      type Query { hello: String }
      type Subscription { tick: Int }
    `,
    resolvers: {
      Query: { hello: () => "world" },
      Subscription: {
        tick: {
          subscribe: (
            _root: unknown,
            _args: unknown,
            ctx: Context,
          ): AsyncGenerator<{ tick: number }> => {
            seen.push(ctx);
            return (async function* () {
              await Promise.resolve();
              yield { tick: 1 };
            })();
          },
        },
      },
    },
  });
}

type AuthOptions = {
  /** AUTH_ENABLED: the authorization policy. */
  enabled: boolean;
  /** RESOLVE_CALLER_IDENTITY: whether the bearer is read at all. */
  resolveIdentity?: boolean;
  /** REQUIRE_AUTHENTICATED_CALLER: the refuse-anonymous switch. */
  requireAuthenticatedCaller: boolean;
};

type Harness = {
  url: string;
  /** Contexts the subscription resolver ran with. */
  seen: Context[];
  logger: ReturnType<typeof makeLogger>;
  close: () => Promise<void>;
};

// One WebSocketServer bound to the http server by path, as `server.ts` does.

// `attachCount` graphql-ws servers on it: production attaches one per subgraph.
async function createHarness(
  adapterName: keyof typeof ADAPTERS,
  auth: AuthOptions,
  attachCount = 1,
): Promise<Harness> {
  const logger = makeLogger();
  const adapter = ADAPTERS[adapterName]() as IGatewayAdapter<Context>;
  const httpServer: Server = createServer();
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const port = (httpServer.address() as { port: number }).port;
  await adapter.start(httpServer);

  const wsServer = new WebSocketServer({ server: httpServer, path: WS_PATH });
  wsServer.setMaxListeners(0);

  const authService = new AuthService({
    enabled: auth.enabled,
    resolveIdentity: auth.resolveIdentity,
    admins: ADMINS,
    skipCredentialVerification: true,
  });

  const seen: Context[] = [];
  const handlers = createWsAuthHandlers({
    authService,
    requireAuthenticatedCaller: () => auth.requireAuthenticatedCaller,
    logger,
    buildContext: (connectionParams, user) => {
      const context: Context = {
        headers: connectionParams as Record<string, string>,
        db: null,
      };
      if (user) context.user = user;
      return context;
    },
  });

  const disposers = [];
  for (let i = 0; i < attachCount; i++) {
    disposers.push(
      adapter.attachWebSocket(wsServer, makeSchema(seen), handlers),
    );
  }

  return {
    url: `ws://localhost:${port}${WS_PATH}`,
    seen,
    logger,
    close: async () => {
      // Each disposer closes the shared wsServer, so siblings then reject.
      for (const disposer of disposers) {
        try {
          await disposer.dispose();
        } catch {
          /* already closed by a sibling disposer */
        }
      }
      await adapter.stop();
      await new Promise<void>((resolve) => wsServer.close(() => resolve()));
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    },
  };
}

type Outcome =
  | { kind: "closed"; code: number }
  | { kind: "next" }
  | { kind: "timeout" };

/** `retryAttempts: 0` so a retryable close does not loop; the code is asserted. */
async function subscribeOnce(
  harness: Harness,
  connectionParams: Record<string, unknown>,
  operations = 1,
): Promise<Outcome> {
  const client = createClient({
    url: harness.url,
    webSocketImpl: WebSocket,
    retryAttempts: 0,
    lazy: true,
    connectionParams,
  });

  const run = () =>
    new Promise<Outcome>((resolve) => {
      const timer = setTimeout(() => resolve({ kind: "timeout" }), 5_000);
      const settle = (outcome: Outcome) => {
        clearTimeout(timer);
        resolve(outcome);
      };
      client.subscribe(
        { query: "subscription { tick }" },
        {
          // Servers sharing a socket duplicate payloads; counting pins nothing.
          next: () => settle({ kind: "next" }),
          error: (err: unknown) => {
            const code = (err as { code?: number } | null)?.code;
            settle(
              typeof code === "number"
                ? { kind: "closed", code }
                : { kind: "timeout" },
            );
          },
          complete: () => settle({ kind: "next" }),
        },
      );
    });

  try {
    let outcome = await run();
    for (let i = 1; i < operations; i++) outcome = await run();
    return outcome;
  } finally {
    await client.dispose();
  }
}

// ─── cases ───────────────────────────────────────────────────────────────────

describe.each(["apollo", "mercurius", "stitching"] as const)(
  "WebSocket auth close codes (%s adapter)",
  (adapterName) => {
    let harness: Harness | undefined;
    let consoleError: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      vi.clearAllMocks();
      mockVerifyAuthBearerToken.mockResolvedValue(makeVerified());
      // graphql-ws reports the 4500 path through console.error, not our logger.
      consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(async () => {
      consoleError.mockRestore();
      await harness?.close();
      harness = undefined;
    });

    it("refuses a tokenless connection with 4403 when a caller is required", async () => {
      harness = await createHarness(adapterName, {
        enabled: true,
        requireAuthenticatedCaller: true,
      });

      const outcome = await subscribeOnce(harness, {});

      expect(outcome).toEqual({ kind: "closed", code: 4403 });
      expect(harness.seen).toHaveLength(0);
      // A throw would close 4500 and log; a missing token is no server error.
      expect(consoleError).not.toHaveBeenCalled();
      expect(harness.logger.error).not.toHaveBeenCalled();
      expect(harness.logger.warn).toHaveBeenCalled();
    });

    it("admits a tokenless connection with no user when anonymous is allowed", async () => {
      harness = await createHarness(adapterName, {
        enabled: true,
        requireAuthenticatedCaller: false,
      });

      const outcome = await subscribeOnce(harness, {});

      // Parity with HTTP and SSE: it runs, and authorizes per document.
      expect(outcome).toEqual({ kind: "next" });
      expect(harness.seen.length).toBeGreaterThan(0);
      expect(harness.seen[0].user).toBeUndefined();
    });

    it("refuses a tokenless connection with 4403 under an open policy", async () => {
      // HTTP and SSE 401 this config; WS admitted it, gating on AUTH_ENABLED.
      harness = await createHarness(adapterName, {
        enabled: false,
        resolveIdentity: true,
        requireAuthenticatedCaller: true,
      });

      const outcome = await subscribeOnce(harness, {});

      expect(outcome).toEqual({ kind: "closed", code: 4403 });
      expect(harness.seen).toHaveLength(0);
    });

    it("puts the verified caller on the context, verifying once per connection", async () => {
      harness = await createHarness(adapterName, {
        enabled: true,
        requireAuthenticatedCaller: true,
      });

      const outcome = await subscribeOnce(
        harness,
        { authorization: "Bearer token-abc" },
        2,
      );

      expect(outcome).toEqual({ kind: "next" });
      expect(harness.seen[0].user?.address).toBe("0xuser");
      expect(harness.seen.length).toBeGreaterThan(1);
      // Two operations, one JWT verify: the old factory verified per subscribe.
      expect(mockVerifyAuthBearerToken).toHaveBeenCalledTimes(1);
    });

    it("refuses a present-but-unusable bearer with 4403, not 4500", async () => {
      mockVerifyAuthBearerToken.mockResolvedValue(false);
      harness = await createHarness(adapterName, {
        enabled: true,
        requireAuthenticatedCaller: false,
      });

      const outcome = await subscribeOnce(harness, {
        authorization: "Bearer bad-token",
      });

      // Refused whatever REQUIRE_AUTHENTICATED_CALLER says, as HTTP 401s it.

      // Retryable, so a client can reconnect with a fresh token.
      expect(outcome).toEqual({ kind: "closed", code: 4403 });
      expect(consoleError).not.toHaveBeenCalled();
      expect(harness.logger.error).not.toHaveBeenCalled();
      expect(harness.logger.warn).toHaveBeenCalled();
    });

    it("keeps refusing with 4403 when several subgraphs share one socket", async () => {
      // A single-subgraph harness hides whichever server answered first.
      harness = await createHarness(
        adapterName,
        { enabled: true, requireAuthenticatedCaller: true },
        2,
      );

      const outcome = await subscribeOnce(harness, {});

      expect(outcome).toEqual({ kind: "closed", code: 4403 });
      expect(harness.seen).toHaveLength(0);
    });
  },
);
