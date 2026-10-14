// A WebSocket is authenticated once, at connect. The monitor re-verifies the
// credential of every authenticated connection on an interval and on
// invalidation, and closes the ones whose credential no longer holds.

import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ILogger } from "document-model";
import { createWsAuthHandlers } from "../../src/graphql/graphql-manager.js";
import { WS_CLOSE_REASON_CREDENTIAL_REVOKED } from "../../src/graphql/gateway/types.js";
import { WsCredentialMonitor } from "../../src/graphql/ws-credential-monitor.js";
import { AuthService, type User } from "../../src/services/auth.service.js";

const mockVerifyAuthBearerToken = vi.fn();
vi.mock("@renown/sdk", () => ({
  verifyAuthBearerToken: (...args: unknown[]) =>
    mockVerifyAuthBearerToken(...args),
}));

function makeLogger(): ILogger {
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
  return logger as unknown as ILogger;
}

class FakeSocket extends EventEmitter {
  closed: { code: number; reason: string } | undefined;
  close(code: number, reason: string) {
    this.closed = { code, reason };
    this.emit("close", code, reason);
  }
}

function connection() {
  const socket = new FakeSocket();
  return { socket };
}

function user(address: string, appKey = "did:key:app1"): User {
  return { address, chainId: 1, networkId: "eip155", appKey };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe("WsCredentialMonitor", () => {
  const verifyCredential = vi.fn();
  let auth: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    verifyCredential.mockResolvedValue(true);
    auth = new AuthService({
      enabled: true,
      admins: [],
      credentialVerificationCacheTtlMs: 0,
      verifyCredential,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("closes a connection whose credential was revoked, on the next interval", async () => {
    vi.useFakeTimers();
    const monitor = new WsCredentialMonitor({
      authService: auth,
      intervalMs: 1_000,
      logger: makeLogger(),
    });
    monitor.start();
    const alice = connection();
    const bob = connection();
    monitor.track(alice, user("0xalice"));
    monitor.track(bob, user("0xbob"));

    verifyCredential.mockImplementation(({ address }: { address: string }) =>
      Promise.resolve(address !== "0xalice"),
    );
    await vi.advanceTimersByTimeAsync(1_000);

    expect(alice.socket.closed).toEqual({
      code: 4403,
      reason: WS_CLOSE_REASON_CREDENTIAL_REVOKED,
    });
    expect(bob.socket.closed).toBeUndefined();
    expect(monitor.size).toBe(1);
    monitor.dispose();
  });

  it("re-verifies the matching connections at once when a credential is invalidated", async () => {
    const monitor = new WsCredentialMonitor({
      authService: auth,
      intervalMs: 0,
      logger: makeLogger(),
    });
    monitor.start();
    const alice1 = connection();
    const alice2 = connection();
    const bob = connection();
    monitor.track(alice1, user("0xAlice", "did:key:app1"));
    monitor.track(alice2, user("0xalice", "did:key:app2"));
    monitor.track(bob, user("0xbob"));

    verifyCredential.mockImplementation(({ appId }: { appId: string }) =>
      Promise.resolve(appId !== "did:key:app1"),
    );
    auth.invalidateCredential("0xalice", 1, "did:key:app1");
    await flush();

    expect(alice1.socket.closed?.reason).toBe(
      WS_CLOSE_REASON_CREDENTIAL_REVOKED,
    );
    expect(alice2.socket.closed).toBeUndefined();
    // Only the invalidated identity is re-verified.
    expect(verifyCredential).toHaveBeenCalledTimes(1);
    monitor.dispose();
  });

  it("keeps a connection open when the check fails transiently", async () => {
    const logger = makeLogger();
    const monitor = new WsCredentialMonitor({
      authService: auth,
      intervalMs: 0,
      logger,
    });
    const alice = connection();
    monitor.track(alice, user("0xalice"));
    verifyCredential.mockRejectedValue(new Error("renown unreachable"));

    expect(await monitor.recheck()).toBe(0);
    expect(alice.socket.closed).toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });

  it("forgets a connection once its socket closes", () => {
    const monitor = new WsCredentialMonitor({
      authService: auth,
      intervalMs: 0,
      logger: makeLogger(),
    });
    const alice = connection();
    monitor.track(alice, user("0xalice"));
    expect(monitor.size).toBe(1);
    alice.socket.emit("close");
    expect(monitor.size).toBe(0);
  });

  it("stops listening for invalidations once disposed", async () => {
    const monitor = new WsCredentialMonitor({
      authService: auth,
      intervalMs: 0,
      logger: makeLogger(),
    });
    monitor.start();
    const alice = connection();
    monitor.track(alice, user("0xalice"));
    monitor.dispose();

    verifyCredential.mockResolvedValue(false);
    auth.invalidateCredential("0xalice");
    await flush();
    expect(verifyCredential).not.toHaveBeenCalled();
    expect(monitor.size).toBe(0);
  });
});

describe("createWsAuthHandlers with a credential monitor", () => {
  it("tracks authenticated connections only", async () => {
    mockVerifyAuthBearerToken.mockResolvedValue({
      verifiableCredential: {
        credentialSubject: {
          address: "0xalice",
          chainId: 1,
          networkId: "eip155",
        },
      },
      issuer: "did:key:app1",
    });
    const auth = new AuthService({
      enabled: true,
      admins: [],
      skipCredentialVerification: true,
    });
    const monitor = new WsCredentialMonitor({
      authService: auth,
      intervalMs: 0,
      logger: makeLogger(),
    });
    const handlers = createWsAuthHandlers({
      authService: auth,
      requireAuthenticatedCaller: () => false,
      logger: makeLogger(),
      credentialMonitor: monitor,
      buildContext: (headers, u) => ({
        headers: headers as never,
        db: null,
        user: u,
      }),
    });

    expect(
      await handlers.onConnect({ authorization: "Bearer t" }, connection()),
    ).toBe(true);
    expect(await handlers.onConnect({}, connection())).toBe(true);
    expect(monitor.size).toBe(1);
  });
});

describe("resolveWsCredentialRecheckIntervalMs", () => {
  it("defaults to 60s, honours overrides and rejects junk", async () => {
    const { resolveWsCredentialRecheckIntervalMs } =
      await import("../../src/graphql/ws-credential-monitor.js");
    const logger = makeLogger();
    expect(resolveWsCredentialRecheckIntervalMs(undefined, logger)).toBe(
      60_000,
    );
    expect(resolveWsCredentialRecheckIntervalMs("0", logger)).toBe(0);
    expect(resolveWsCredentialRecheckIntervalMs("15000", logger)).toBe(15_000);
    expect(resolveWsCredentialRecheckIntervalMs("-5", logger)).toBe(60_000);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});
