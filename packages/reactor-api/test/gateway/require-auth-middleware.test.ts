/**
 * Unit tests for createRequireAuthFetchMiddleware.
 *
 * The middleware is the enforcement half of the resolve-and-don't-enforce
 * split: it reads the AuthContext the auth middleware recorded on the
 * request (the WeakMap pattern) and rejects the request with a 401 when no
 * caller was resolved. AuthService is mocked so tests are pure unit tests
 * with no network I/O or real token verification.
 */

import { describe, expect, it, vi } from "vitest";
import {
  createAuthFetchMiddleware,
  getAuthContext,
} from "../../src/graphql/gateway/auth-middleware.js";
import { createRequireAuthFetchMiddleware } from "../../src/graphql/gateway/require-auth-middleware.js";
import type { FetchHandler } from "../../src/graphql/gateway/types.js";
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

function makeRequest(
  url = "http://localhost/graphql",
  method = "POST",
): globalThis.Request {
  return new globalThis.Request(url, { method });
}

/** A next handler that records every request it is handed. */
function makeNextSpy() {
  const calls: globalThis.Request[] = [];
  const handler: FetchHandler = (request) => {
    calls.push(request);
    return Promise.resolve(new globalThis.Response("next"));
  };
  return { calls, handler };
}

/** The composed chain the gateway builds: auth outermost, require-auth next. */
function compose(
  result: AuthContext | globalThis.Response,
  next: FetchHandler,
) {
  const authService = makeAuthService(result);
  const requireAuth = createRequireAuthFetchMiddleware();
  return createAuthFetchMiddleware(authService as unknown as AuthService)(
    requireAuth(next),
  );
}

const AUTHENTICATED: AuthContext = {
  user: {
    address: "0xuser",
    chainId: 1,
    networkId: "mainnet",
    appKey: "did:key:zuser",
  },
  admins: ["0xadmin"],
  auth_enabled: true,
};

/** The OPEN-policy shape: a resolved caller while the policy enforces nothing. */
const AUTHENTICATED_OPEN: AuthContext = {
  ...AUTHENTICATED,
  auth_enabled: false,
};

const ANONYMOUS: AuthContext = {
  user: undefined,
  admins: [],
  auth_enabled: false,
};

// ─── tests ────────────────────────────────────────────────────────────────────

describe("createRequireAuthFetchMiddleware", () => {
  it("passes through and calls next when the auth middleware resolved a user", async () => {
    const { calls, handler } = makeNextSpy();
    const middleware = compose(AUTHENTICATED, handler);
    const request = makeRequest();

    const response = await middleware(request);

    expect(response.status).toBe(200);
    expect(calls).toEqual([request]);
  });

  it("admits a resolved caller under the OPEN policy (auth_enabled false)", async () => {
    const { calls, handler } = makeNextSpy();
    const middleware = compose(AUTHENTICATED_OPEN, handler);
    const request = makeRequest();

    const response = await middleware(request);

    expect(response.status).toBe(200);
    expect(calls).toEqual([request]);
  });

  it("rejects an anonymous caller with a 401 and does not call next", async () => {
    const { calls, handler } = makeNextSpy();
    const middleware = compose(ANONYMOUS, handler);

    const response = await middleware(makeRequest());

    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("Authentication required");
    expect(calls).toHaveLength(0);
  });

  it("rejects with a 401 when no auth middleware ran (fail closed)", async () => {
    const { calls, handler } = makeNextSpy();
    const middleware = createRequireAuthFetchMiddleware()(handler);

    const response = await middleware(makeRequest());

    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("Authentication required");
    expect(calls).toHaveLength(0);
  });

  it("lets OPTIONS preflights through even without a resolved caller", async () => {
    const { calls, handler } = makeNextSpy();
    const middleware = compose(ANONYMOUS, handler);
    const request = makeRequest("http://localhost/graphql", "OPTIONS");

    const response = await middleware(request);

    expect(response.status).toBe(200);
    expect(calls).toEqual([request]);
  });

  it("surfaces the auth middleware's 401 for an invalid token unchanged", async () => {
    const { calls, handler } = makeNextSpy();
    const invalidToken = new globalThis.Response(
      JSON.stringify({ error: "Verification failed" }),
      { status: 401 },
    );
    const middleware = compose(invalidToken, handler);

    const response = await middleware(makeRequest());

    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("Verification failed");
    expect(calls).toHaveLength(0);
  });

  it("does not consume the request body, so the subgraph handler can read it", async () => {
    const { calls, handler } = makeNextSpy();
    const middleware = compose(AUTHENTICATED, handler);
    const request = new globalThis.Request("http://localhost/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "{ r { drives { results } } }" }),
    });

    await middleware(request);

    // The same Request object flows through the chain; its body must still
    // be readable by the downstream handler.
    expect(calls).toEqual([request]);
    await expect(request.clone().json()).resolves.toMatchObject({
      query: "{ r { drives { results } } }",
    });
  });

  it("leaves the auth middleware's context on the request for the context factory", async () => {
    const { handler } = makeNextSpy();
    const middleware = compose(AUTHENTICATED, handler);
    const request = makeRequest();

    await middleware(request);

    expect(getAuthContext(request)?.user?.address).toBe("0xuser");
  });
});
