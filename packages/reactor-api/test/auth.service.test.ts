/**
 * Unit tests for AuthService.authenticateRequest().
 *
 * verifyAuthBearerToken is mocked at the module level so tests run without
 * real JWT verification or network calls. skipCredentialVerification=true is
 * used on tests that only care about token verification, to avoid the Renown
 * API fetch inside verifyCredentialExists().
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthService } from "../src/services/auth.service.js";

// ─── mock @renown/sdk ─────────────────────────────────────────────────────────

const mockVerifyAuthBearerToken = vi.fn();
const mockVerifyCredential = vi.fn();

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

    it("passes GET requests with no Authorization header through (anonymous reads allowed)", async () => {
      const result = await service.authenticateRequest(makeRequest("GET"));

      expect(result).toEqual({
        user: undefined,
        admins: ADMINS,
        auth_enabled: true,
      });
      expect(mockVerifyAuthBearerToken).not.toHaveBeenCalled();
    });

    /**
     * A GET query's payload can itself be an authorization verdict (e.g.
     * evaluateActions over a persisted query), so a token on a GET must
     * authenticate the caller rather than be silently discarded and answer
     * for the anonymous subject.
     */
    it("verifies the token a GET request carries", async () => {
      mockVerifyAuthBearerToken.mockResolvedValue(makeVerified());

      const result = await service.authenticateRequest(
        makeRequest("GET", { authorization: "Bearer valid-token" }),
      );

      expect(mockVerifyAuthBearerToken).toHaveBeenCalledWith("valid-token");
      expect(result).toEqual({
        user: {
          address: "0xuser",
          chainId: 1,
          networkId: "eip155",
          appKey: "did:ethr:0xapp",
        },
        admins: ADMINS,
        auth_enabled: true,
      });
    });

    it("returns a 401 Response for a GET carrying an invalid token", async () => {
      mockVerifyAuthBearerToken.mockResolvedValue(false);

      const result = await service.authenticateRequest(
        makeRequest("GET", { authorization: "Bearer bad-token" }),
      );

      expect(result).toBeInstanceOf(Response);
      expect((result as Response).status).toBe(401);
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
        user: {
          address: "0xuser",
          chainId: 1,
          networkId: "eip155",
          appKey: "did:ethr:0xapp",
        },
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

  // ── verifyBearer (method-agnostic) ──────────────────────────────────────────

  /**
   * The app key is what a document records as its creator, so a request that
   * arrives without one decides as a different principal than the same signer's
   * writes do -- and the document's own creator is refused an operation the
   * write path accepts. It comes from the credential's issuer, which is the DID
   * the token's signature was verified against, so it is authenticated rather
   * than asserted.
   */
  describe("the authenticated app key", () => {
    let service: AuthService;

    beforeEach(() => {
      service = new AuthService({
        enabled: true,
        admins: ADMINS,
        skipCredentialVerification: true,
      });
    });

    it("carries the verified credential's issuer", async () => {
      const verified = makeVerified();
      verified.issuer = "did:key:zSomeAppInstance";
      mockVerifyAuthBearerToken.mockResolvedValue(verified);

      const result = await service.verifyBearer("Bearer valid-token");

      expect(result).toMatchObject({
        user: { appKey: "did:key:zSomeAppInstance" },
      });
    });

    it("distinguishes two app instances of the same address", async () => {
      const first = makeVerified();
      first.issuer = "did:key:zFirstDevice";
      mockVerifyAuthBearerToken.mockResolvedValue(first);
      const one = await service.verifyBearer("Bearer first");

      const second = makeVerified();
      second.issuer = "did:key:zSecondDevice";
      mockVerifyAuthBearerToken.mockResolvedValue(second);
      const two = await service.verifyBearer("Bearer second");

      expect(one).toMatchObject({ user: { appKey: "did:key:zFirstDevice" } });
      expect(two).toMatchObject({ user: { appKey: "did:key:zSecondDevice" } });
    });

    /**
     * Unreachable through real verification -- resolving the issuer is how the
     * signature was checked -- so a credential without one did not come from
     * there. Refused rather than admitted as a keyless principal.
     */
    it("refuses a credential carrying no issuer", async () => {
      const verified = makeVerified();
      verified.issuer = "";
      mockVerifyAuthBearerToken.mockResolvedValue(verified);

      const result = await service.verifyBearer("Bearer valid-token");

      expect(result).toBeInstanceOf(Response);
      expect((result as Response).status).toBe(401);
    });
  });

  describe("AuthService.verifyBearer()", () => {
    it("returns auth_enabled=false when auth is disabled", async () => {
      const service = new AuthService({ enabled: false, admins: ADMINS });

      const result = await service.verifyBearer("Bearer token");

      expect(result).toEqual({
        user: undefined,
        admins: [],
        auth_enabled: false,
      });
      expect(mockVerifyAuthBearerToken).not.toHaveBeenCalled();
    });

    it("returns an AuthContext with no user when authorization is undefined", async () => {
      const service = new AuthService({
        enabled: true,
        admins: ADMINS,
        skipCredentialVerification: true,
      });

      const result = await service.verifyBearer(undefined);

      expect(result).toEqual({
        user: undefined,
        admins: ADMINS,
        auth_enabled: true,
      });
      expect(mockVerifyAuthBearerToken).not.toHaveBeenCalled();
    });

    it("returns an AuthContext with the authenticated user when token is valid", async () => {
      mockVerifyAuthBearerToken.mockResolvedValue(
        makeVerified("0xuser", 1, "eip155"),
      );
      const service = new AuthService({
        enabled: true,
        admins: ADMINS,
        skipCredentialVerification: true,
      });

      const result = await service.verifyBearer("Bearer valid-token");

      expect(result).toEqual({
        user: {
          address: "0xuser",
          chainId: 1,
          networkId: "eip155",
          appKey: "did:ethr:0xapp",
        },
        admins: ADMINS,
        auth_enabled: true,
      });
      expect(mockVerifyAuthBearerToken).toHaveBeenCalledWith("valid-token");
    });

    it("returns a 401 Response when token verification returns false", async () => {
      mockVerifyAuthBearerToken.mockResolvedValue(false);
      const service = new AuthService({
        enabled: true,
        admins: ADMINS,
        skipCredentialVerification: true,
      });

      const result = await service.verifyBearer("Bearer bad-token");

      expect(result).toBeInstanceOf(Response);
      expect((result as Response).status).toBe(401);
      const body = (await (result as Response).json()) as { error: string };
      expect(body.error).toBe("Verification failed");
    });

    it("verifies tokens regardless of HTTP method (no GET/OPTIONS bypass)", async () => {
      mockVerifyAuthBearerToken.mockResolvedValue(makeVerified());
      const service = new AuthService({
        enabled: true,
        admins: ADMINS,
        skipCredentialVerification: true,
      });

      await service.verifyBearer("Bearer token");

      expect(mockVerifyAuthBearerToken).toHaveBeenCalledTimes(1);
    });
  });

  // ── credential verification (Renown API) ────────────────────────────────────

  describe("credential verification caching", () => {
    const ADDRESS = "0xuser";
    const CHAIN_ID = 1;

    function makeService(credentialVerificationCacheTtlMs?: number) {
      return new AuthService({
        enabled: true,
        admins: ADMINS,
        skipCredentialVerification: false,
        credentialVerificationCacheTtlMs,
        verifyCredential: mockVerifyCredential,
      });
    }

    function authenticate(service: AuthService) {
      return service.authenticateRequest(
        makeRequest("POST", { authorization: "Bearer token" }),
      );
    }

    beforeEach(() => {
      vi.useFakeTimers();
      mockVerifyAuthBearerToken.mockResolvedValue(
        makeVerified(ADDRESS, CHAIN_ID),
      );
      mockVerifyCredential.mockResolvedValue(true);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("caches successful checks so repeated requests make a single Renown fetch", async () => {
      const service = makeService();

      const first = await authenticate(service);
      const second = await authenticate(service);

      expect(first).not.toBeInstanceOf(Response);
      expect(second).not.toBeInstanceOf(Response);
      expect(mockVerifyCredential).toHaveBeenCalledTimes(1);
    });

    it("shares a single in-flight fetch across concurrent requests", async () => {
      const service = makeService();

      const results = await Promise.all([
        authenticate(service),
        authenticate(service),
        authenticate(service),
      ]);

      for (const result of results) {
        expect(result).not.toBeInstanceOf(Response);
      }
      expect(mockVerifyCredential).toHaveBeenCalledTimes(1);
    });

    it("does not cache failed checks", async () => {
      mockVerifyCredential.mockResolvedValue(false);
      const service = makeService();

      const first = await authenticate(service);
      const second = await authenticate(service);

      expect(first).toBeInstanceOf(Response);
      expect((first as Response).status).toBe(401);
      expect(second).toBeInstanceOf(Response);
      expect(mockVerifyCredential).toHaveBeenCalledTimes(2);
    });

    it("re-fetches after the TTL expires", async () => {
      const service = makeService(1_000);

      await authenticate(service);
      vi.advanceTimersByTime(1_001);
      await authenticate(service);

      expect(mockVerifyCredential).toHaveBeenCalledTimes(2);
    });

    it("disables caching when the TTL is 0", async () => {
      const service = makeService(0);

      await authenticate(service);
      await authenticate(service);

      expect(mockVerifyCredential).toHaveBeenCalledTimes(2);
    });

    it("caches per user, not globally", async () => {
      const service = makeService();

      await authenticate(service);
      mockVerifyAuthBearerToken.mockResolvedValue(
        makeVerified("0xother", CHAIN_ID),
      );
      await authenticate(service);

      expect(mockVerifyCredential).toHaveBeenCalledTimes(2);
    });

    it("evicts the oldest entries when the cache size cap is reached", async () => {
      const service = makeService();

      for (let i = 0; i < 1_000; i++) {
        mockVerifyAuthBearerToken.mockResolvedValue(
          makeVerified(`0xuser${i}`, CHAIN_ID),
        );
        await authenticate(service);
      }
      expect(mockVerifyCredential).toHaveBeenCalledTimes(1_000);

      mockVerifyAuthBearerToken.mockResolvedValue(
        makeVerified("0xoverflow", CHAIN_ID),
      );
      await authenticate(service);
      expect(mockVerifyCredential).toHaveBeenCalledTimes(1_001);

      mockVerifyAuthBearerToken.mockResolvedValue(
        makeVerified("0xuser0", CHAIN_ID),
      );
      await authenticate(service);
      expect(mockVerifyCredential).toHaveBeenCalledTimes(1_002);
    });
  });

  describe("credential existence check", () => {
    it("returns 401 when the credential no longer exists on the Renown API", async () => {
      mockVerifyAuthBearerToken.mockResolvedValue(makeVerified("0xuser", 1));
      mockVerifyCredential.mockResolvedValue(false);

      const service = new AuthService({
        enabled: true,
        admins: ADMINS,
        skipCredentialVerification: false,
        verifyCredential: mockVerifyCredential,
      });

      const result = await service.authenticateRequest(
        makeRequest("POST", { authorization: "Bearer token" }),
      );

      expect(result).toBeInstanceOf(Response);
      expect((result as Response).status).toBe(401);
    });
  });
});
