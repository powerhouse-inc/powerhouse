/**
 * Unit tests for createAuthFetchMiddleware and getAuthContext.
 *
 * AuthService is mocked so tests are pure unit tests with no network I/O or
 * real token verification.
 */

import { describe, expect, it, vi } from "vitest";
import {
  createAuthFetchMiddleware,
  getAuthContext,
} from "../../src/graphql/gateway/auth-middleware.js";
import type {
  AuthContext,
  AuthService,
} from "../../src/services/auth.service.js";

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeAuthService(
  result: AuthContext | globalThis.Response,
): Pick<AuthService, "authenticateRequest"> {
  return {
    authenticateRequest: vi.fn().mockResolvedValue(result),
  } as unknown as AuthService;
}

function makeRequest(url = "http://localhost/graphql"): globalThis.Request {
  return new globalThis.Request(url, { method: "POST" });
}

const AUTH_CTX: AuthContext = {
  user: { address: "0xabc", chainId: 1, networkId: "eip155" },
  admins: ["0xadmin"],
  auth_enabled: true,
};

// ─── tests ────────────────────────────────────────────────────────────────────

describe("createAuthFetchMiddleware", () => {
  it("calls the next handler and returns its response when auth succeeds", async () => {
    const service = makeAuthService(AUTH_CTX);
    const next = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    const middleware = createAuthFetchMiddleware(service as AuthService);

    const req = makeRequest();
    const res = await middleware(next)(req);

    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith(req);
    expect(res.status).toBe(200);
  });

  it("short-circuits and returns the auth Response without calling next when auth fails", async () => {
    const authResponse = new globalThis.Response(
      JSON.stringify({ error: "Verification failed" }),
      { status: 401 },
    );
    const service = makeAuthService(authResponse);
    const next = vi.fn();
    const middleware = createAuthFetchMiddleware(service as AuthService);

    const res = await middleware(next)(makeRequest());

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toBe(401);
  });

  it("stores the AuthContext in the WeakMap so getAuthContext returns it", async () => {
    const service = makeAuthService(AUTH_CTX);
    const req = makeRequest();
    let capturedRequest: globalThis.Request | undefined;

    const next = vi.fn().mockImplementation((r: globalThis.Request) => {
      capturedRequest = r;
      return Promise.resolve(new Response("ok"));
    });

    const middleware = createAuthFetchMiddleware(service as AuthService);
    await middleware(next)(req);

    expect(capturedRequest).toBe(req);
    expect(getAuthContext(req)).toEqual(AUTH_CTX);
  });

  it("does not store AuthContext in the WeakMap when auth fails", async () => {
    const authResponse = new globalThis.Response(null, { status: 401 });
    const service = makeAuthService(authResponse);
    const req = makeRequest();
    const next = vi.fn();
    const middleware = createAuthFetchMiddleware(service as AuthService);

    await middleware(next)(req);

    expect(getAuthContext(req)).toBeUndefined();
  });
});

describe("getAuthContext", () => {
  it("returns undefined for a request that was never authenticated", () => {
    const freshRequest = makeRequest("http://localhost/other");
    expect(getAuthContext(freshRequest)).toBeUndefined();
  });
});
