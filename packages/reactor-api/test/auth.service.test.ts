/**
 * Unit tests for AuthService.authenticateRequest().
 *
 * verifyAuthBearerToken is mocked at the module level so tests run without
 * real JWT verification or network calls. skipCredentialVerification=true is
 * used on tests that only care about token verification, to avoid the Renown
 * API fetch inside verifyCredentialExists().
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthService } from "../src/services/auth.service.js";

// ─── mock @renown/sdk ─────────────────────────────────────────────────────────

const mockVerifyAuthBearerToken = vi.fn();

vi.mock("@renown/sdk", () => ({
  verifyAuthBearerToken: (...args: unknown[]) =>
    mockVerifyAuthBearerToken(...args),
}));

// ─── fixtures ─────────────────────────────────────────────────────────────────

const ADMINS = ["0xadmin1", "0xadmin2"];

/** A minimal verified-credential shape that AuthService.extractUserFromVerification() accepts. */
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

// ─── tests ────────────────────────────────────────────────────────────────────

describe("AuthService.authenticateRequest()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── auth disabled ───────────────────────────────────────────────────────────

  describe("when auth is disabled", () => {
    it("returns an AuthContext with auth_enabled=false regardless of method or token", async () => {
      const service = new AuthService({ enabled: false, admins: ADMINS });

      const ctx = await service.authenticateRequest(
        makeRequest("POST", { authorization: "Bearer token" }),
      );

      expect(ctx).toEqual({ user: undefined, admins: [], auth_enabled: false });
      expect(mockVerifyAuthBearerToken).not.toHaveBeenCalled();
    });
  });

  // ── passthrough methods ─────────────────────────────────────────────────────

  describe("when auth is enabled", () => {
    const service = new AuthService({
      enabled: true,
      admins: ADMINS,
      skipCredentialVerification: true,
    });

    it("passes OPTIONS requests through without verification", async () => {
      const result = await service.authenticateRequest(makeRequest("OPTIONS"));

      expect(result).toEqual({
        user: undefined,
        admins: ADMINS,
        auth_enabled: true,
      });
      expect(mockVerifyAuthBearerToken).not.toHaveBeenCalled();
    });

    it("passes GET requests through without verification", async () => {
      const result = await service.authenticateRequest(makeRequest("GET"));

      expect(result).toEqual({
        user: undefined,
        admins: ADMINS,
        auth_enabled: true,
      });
      expect(mockVerifyAuthBearerToken).not.toHaveBeenCalled();
    });

    it("passes POST requests with no Authorization header through (anonymous reads allowed)", async () => {
      const result = await service.authenticateRequest(makeRequest("POST"));

      expect(result).toEqual({
        user: undefined,
        admins: ADMINS,
        auth_enabled: true,
      });
      expect(mockVerifyAuthBearerToken).not.toHaveBeenCalled();
    });

    // ── token verification ──────────────────────────────────────────────────

    it("returns a 401 Response when token verification returns false", async () => {
      mockVerifyAuthBearerToken.mockResolvedValue(false);

      const result = await service.authenticateRequest(
        makeRequest("POST", { authorization: "Bearer bad-token" }),
      );

      expect(result).toBeInstanceOf(Response);
      expect((result as Response).status).toBe(401);
      const body = (await (result as Response).json()) as { error: string };
      expect(body.error).toBe("Verification failed");
    });

    it("returns a 401 Response when the verified credential has missing fields", async () => {
      mockVerifyAuthBearerToken.mockResolvedValue({
        verifiableCredential: { credentialSubject: {} }, // no address/chainId/networkId
        issuer: "did:ethr:0xapp",
      });

      const result = await service.authenticateRequest(
        makeRequest("POST", { authorization: "Bearer incomplete-token" }),
      );

      expect(result).toBeInstanceOf(Response);
      expect((result as Response).status).toBe(401);
      const body = (await (result as Response).json()) as { error: string };
      expect(body.error).toBe("Missing credentials");
    });

    it("returns a 401 Response when verifyToken throws", async () => {
      mockVerifyAuthBearerToken.mockRejectedValue(new Error("SDK failure"));

      const result = await service.authenticateRequest(
        makeRequest("POST", { authorization: "Bearer broken-token" }),
      );

      expect(result).toBeInstanceOf(Response);
      expect((result as Response).status).toBe(401);
      const body = (await (result as Response).json()) as { error: string };
      expect(body.error).toBe("Authentication failed");
    });

    it("returns an AuthContext with the authenticated user when token is valid", async () => {
      mockVerifyAuthBearerToken.mockResolvedValue(
        makeVerified("0xuser", 1, "eip155"),
      );

      const result = await service.authenticateRequest(
        makeRequest("POST", { authorization: "Bearer valid-token" }),
      );

      expect(result).toEqual({
        user: { address: "0xuser", chainId: 1, networkId: "eip155" },
        admins: ADMINS,
        auth_enabled: true,
      });
    });

    it("extracts the Bearer token from the Authorization header", async () => {
      mockVerifyAuthBearerToken.mockResolvedValue(makeVerified());

      await service.authenticateRequest(
        makeRequest("POST", { authorization: "Bearer my-secret-token" }),
      );

      expect(mockVerifyAuthBearerToken).toHaveBeenCalledWith("my-secret-token");
    });
  });

  // ── credential verification (Renown API) ────────────────────────────────────

  describe("credential existence check", () => {
    it("returns 401 when the credential no longer exists on the Renown API", async () => {
      mockVerifyAuthBearerToken.mockResolvedValue(makeVerified("0xuser", 1));

      // Mock global fetch to simulate Renown API returning a non-200 or bad body
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockRejectedValue(new Error("network error"));

      const service = new AuthService({
        enabled: true,
        admins: ADMINS,
        skipCredentialVerification: false,
      });

      const result = await service.authenticateRequest(
        makeRequest("POST", { authorization: "Bearer token" }),
      );

      expect(result).toBeInstanceOf(Response);
      expect((result as Response).status).toBe(401);

      fetchSpy.mockRestore();
    });
  });
});
