/**
 * Integration tests for the full authentication chain:
 *   AuthService → createAuthFetchMiddleware → downstream handler
 *
 * These tests wire together the real AuthService and the real auth middleware
 * to verify the end-to-end authentication contract that was previously
 * implemented as Express middleware mutating req.user/req.admins/req.auth_enabled.
 *
 * @renown/sdk is mocked to avoid real JWT verification and network calls.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAuthFetchMiddleware,
  getAuthContext,
} from "../src/graphql/gateway/auth-middleware.js";
import { AuthService } from "../src/services/auth.service.js";

// ── mock @renown/sdk ───────────────────────────────────────────────────────────

const mockVerifyAuthBearerToken = vi.fn();

vi.mock("@renown/sdk", () => ({
  verifyAuthBearerToken: (...args: unknown[]) =>
    mockVerifyAuthBearerToken(...args),
}));

// ── fixtures ──────────────────────────────────────────────────────────────────

const ADMINS = ["0xadmin"];

function makeVerified(address = "0xuser", chainId = 1, networkId = "eip155") {
  return {
    verifiableCredential: {
      credentialSubject: { address, chainId, networkId },
    },
    issuer: "did:ethr:0xapp",
  };
}

function makeRequest(
  method = "POST",
  headers: Record<string, string> = {},
): Request {
  return new Request("http://localhost/graphql", { method, headers });
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("Auth chain integration (AuthService → authFetchMiddleware → handler)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── auth enabled ─────────────────────────────────────────────────────────────

  describe("when auth is enabled", () => {
    const service = new AuthService({
      enabled: true,
      admins: ADMINS,
      skipCredentialVerification: true,
    });

    function buildChain() {
      const intercepted: Request[] = [];
      const next = vi.fn(async (req: Request) => {
        intercepted.push(req);
        return new Response("handler ok", { status: 200 });
      });
      const handler = createAuthFetchMiddleware(service)(next);
      return { handler, next, intercepted };
    }

    it("returns 401 without calling the handler when the token fails verification", async () => {
      mockVerifyAuthBearerToken.mockResolvedValue(false);
      const { handler, next } = buildChain();

      const res = await handler(
        makeRequest("POST", { authorization: "Bearer bad-token" }),
      );

      expect(res.status).toBe(401);
      expect(next).not.toHaveBeenCalled();
    });

    it("returns 401 without calling the handler when verifyToken throws", async () => {
      mockVerifyAuthBearerToken.mockRejectedValue(new Error("SDK error"));
      const { handler, next } = buildChain();

      const res = await handler(
        makeRequest("POST", { authorization: "Bearer broken" }),
      );

      expect(res.status).toBe(401);
      expect(next).not.toHaveBeenCalled();
    });

    it("returns 401 without calling the handler when the verified credential is missing user fields", async () => {
      mockVerifyAuthBearerToken.mockResolvedValue({
        verifiableCredential: { credentialSubject: {} }, // no address/chainId/networkId
        issuer: "did:ethr:0xapp",
      });
      const { handler, next } = buildChain();

      const res = await handler(
        makeRequest("POST", { authorization: "Bearer incomplete" }),
      );

      expect(res.status).toBe(401);
      expect(next).not.toHaveBeenCalled();
    });

    it("calls the handler and stores AuthContext with the authenticated user for a valid token", async () => {
      mockVerifyAuthBearerToken.mockResolvedValue(
        makeVerified("0xuser", 1, "eip155"),
      );
      const { handler, intercepted } = buildChain();

      const req = makeRequest("POST", { authorization: "Bearer valid" });
      const res = await handler(req);

      expect(res.status).toBe(200);
      expect(intercepted).toContain(req);
      const ctx = getAuthContext(req);
      expect(ctx?.user).toEqual({
        address: "0xuser",
        chainId: 1,
        networkId: "eip155",
      });
      expect(ctx?.auth_enabled).toBe(true);
      expect(ctx?.admins).toEqual(ADMINS);
    });

    it("passes OPTIONS requests through to the handler without token verification", async () => {
      const { handler, intercepted } = buildChain();

      const req = makeRequest("OPTIONS");
      await handler(req);

      expect(intercepted).toContain(req);
      expect(mockVerifyAuthBearerToken).not.toHaveBeenCalled();
      const ctx = getAuthContext(req);
      expect(ctx?.user).toBeUndefined();
      expect(ctx?.auth_enabled).toBe(true);
    });

    it("passes GET requests through to the handler without token verification", async () => {
      const { handler, intercepted } = buildChain();

      const req = makeRequest("GET");
      await handler(req);

      expect(intercepted).toContain(req);
      expect(mockVerifyAuthBearerToken).not.toHaveBeenCalled();
    });

    it("passes anonymous POST requests through to the handler (no Authorization header)", async () => {
      const { handler, intercepted } = buildChain();

      const req = makeRequest("POST"); // no auth header
      await handler(req);

      expect(intercepted).toContain(req);
      expect(mockVerifyAuthBearerToken).not.toHaveBeenCalled();
      const ctx = getAuthContext(req);
      expect(ctx?.user).toBeUndefined();
      expect(ctx?.auth_enabled).toBe(true);
    });

    it("stores the admin list in the AuthContext so callers can perform admin checks", async () => {
      mockVerifyAuthBearerToken.mockResolvedValue(makeVerified());
      const { handler } = buildChain();

      const req = makeRequest("POST", { authorization: "Bearer valid" });
      await handler(req);

      const ctx = getAuthContext(req);
      expect(ctx?.admins).toContain("0xadmin");
      expect(ctx?.admins).not.toContain("0xother");
    });

    it("does not store AuthContext when authentication fails (no WeakMap leak)", async () => {
      mockVerifyAuthBearerToken.mockResolvedValue(false);
      const { handler } = buildChain();

      const req = makeRequest("POST", { authorization: "Bearer bad" });
      await handler(req);

      expect(getAuthContext(req)).toBeUndefined();
    });
  });

  // ── auth disabled ─────────────────────────────────────────────────────────────

  describe("when auth is disabled", () => {
    const service = new AuthService({ enabled: false, admins: ADMINS });

    it("always calls the handler and sets auth_enabled=false, regardless of token", async () => {
      const intercepted: Request[] = [];
      const next = vi.fn(async (req: Request) => {
        intercepted.push(req);
        return new Response("ok");
      });
      const handler = createAuthFetchMiddleware(service)(next);

      const req = makeRequest("POST", { authorization: "Bearer anything" });
      await handler(req);

      expect(intercepted).toContain(req);
      expect(mockVerifyAuthBearerToken).not.toHaveBeenCalled();
      const ctx = getAuthContext(req);
      expect(ctx?.auth_enabled).toBe(false);
      expect(ctx?.user).toBeUndefined();
    });
  });
});
