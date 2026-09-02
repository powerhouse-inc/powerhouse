/**
 * Unit tests for `AuthConfig.resolveIdentity` — reading the bearer independently
 * of whether the authorization policy enforces anything.
 *
 * The pairing that matters is `enabled: false, resolveIdentity: true`: the caller
 * is verified and `ctx.user` is populated, while `auth_enabled` stays false so
 * everything that gates on "is authentication enforced" — the attachment routes
 * do — is untouched. The rest of the cases pin backwards compatibility: with
 * `resolveIdentity` omitted, every path behaves exactly as it did before the
 * option existed.
 *
 * `verifyAuthBearerToken` is mocked at the module level, as in
 * `auth.service.test.ts`, so no JWT verification or network call happens.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthService } from "../src/services/auth.service.js";

const mockVerifyAuthBearerToken = vi.fn();

vi.mock("@renown/sdk", () => ({
  verifyAuthBearerToken: (...args: unknown[]) =>
    mockVerifyAuthBearerToken(...args),
}));

const ADMINS = ["0xadmin1", "0xadmin2"];
const BEARER = { authorization: "Bearer token-abc" };

function makeVerified(address = "0xuser") {
  return {
    verifiableCredential: {
      credentialSubject: { address, chainId: 1, networkId: "eip155" },
    },
    issuer: "did:key:zApp",
  };
}

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/graphql", { method: "POST", headers });
}

/** Narrow the union: every case here expects a context, never a 401 Response. */
function asContext(result: unknown) {
  expect(result).not.toBeInstanceOf(Response);
  return result as {
    user?: { address: string };
    admins: string[];
    auth_enabled: boolean;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyAuthBearerToken.mockResolvedValue(makeVerified());
});

describe("resolveIdentity: false, enabled: false (the default when auth is off)", () => {
  const service = new AuthService({
    enabled: false,
    admins: ADMINS,
    skipCredentialVerification: true,
  });

  it("never reads the bearer", async () => {
    const result = asContext(
      await service.authenticateRequest(makeRequest(BEARER)),
    );

    expect(result.user).toBeUndefined();
    expect(result.auth_enabled).toBe(false);
    /* The point of the whole option: today this is the only outcome available
       with the policy left open, and it is what leaves a custom subgraph
       resolver unable to tell who is calling. */
    expect(mockVerifyAuthBearerToken).not.toHaveBeenCalled();
  });

  it("exposes no admin list, so nothing can match against one", async () => {
    const result = asContext(await service.authenticateRequest(makeRequest()));

    expect(result.admins).toEqual([]);
  });

  it("refuses a websocket connection without looking at its token", async () => {
    await expect(
      service.authenticateWebSocketConnection(BEARER),
    ).resolves.toBeNull();
    expect(mockVerifyAuthBearerToken).not.toHaveBeenCalled();
  });
});

describe("resolveIdentity: true, enabled: false (identity without enforcement)", () => {
  const service = new AuthService({
    enabled: false,
    resolveIdentity: true,
    admins: ADMINS,
    skipCredentialVerification: true,
  });

  it("verifies the bearer and populates the user", async () => {
    const result = asContext(
      await service.authenticateRequest(makeRequest(BEARER)),
    );

    expect(mockVerifyAuthBearerToken).toHaveBeenCalledWith("token-abc");
    expect(result.user?.address).toBe("0xuser");
  });

  it("still reports auth_enabled=false, so enforcement stays off", async () => {
    const result = asContext(
      await service.authenticateRequest(makeRequest(BEARER)),
    );

    /* Load-bearing: `apps/switchboard/src/attachments/auth.ts` refuses an
       anonymous request when `auth_enabled` is true. Resolving an identity must
       not start rejecting callers that were previously served. */
    expect(result.auth_enabled).toBe(false);
  });

  it("admits a request with no token, as anonymous", async () => {
    const result = asContext(await service.authenticateRequest(makeRequest()));

    expect(result.user).toBeUndefined();
    expect(result.auth_enabled).toBe(false);
    expect(mockVerifyAuthBearerToken).not.toHaveBeenCalled();
  });

  it("still refuses an invalid token with a 401", async () => {
    mockVerifyAuthBearerToken.mockResolvedValue(false);

    const result = await service.authenticateRequest(makeRequest(BEARER));

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
  });

  it("resolves a websocket connection's user too", async () => {
    const user = await service.authenticateWebSocketConnection(BEARER);

    expect(user?.address).toBe("0xuser");
  });

  it("verifies the Renown credential unless explicitly skipped", async () => {
    const verifyCredential = vi.fn().mockResolvedValue(true);
    const checking = new AuthService({
      enabled: false,
      resolveIdentity: true,
      admins: ADMINS,
      verifyCredential,
    });

    await checking.authenticateRequest(makeRequest(BEARER));

    /* Identity resolution does exactly what verifyBearer already did — the
       credential check is what binds the signing key to the claimed address, so
       dropping it would leave a `user` nobody should trust. */
    expect(verifyCredential).toHaveBeenCalledWith({
      address: "0xuser",
      chainId: 1,
      appId: "did:key:zApp",
    });
  });

  it("refuses a token whose credential no longer exists", async () => {
    const checking = new AuthService({
      enabled: false,
      resolveIdentity: true,
      admins: ADMINS,
      verifyCredential: vi.fn().mockResolvedValue(false),
    });

    const result = await checking.authenticateRequest(makeRequest(BEARER));

    expect((result as Response).status).toBe(401);
  });
});

describe("resolveIdentity omitted (backwards compatibility)", () => {
  it("follows enabled=true: reads the bearer and reports enforcement", async () => {
    const service = new AuthService({
      enabled: true,
      admins: ADMINS,
      skipCredentialVerification: true,
    });

    const result = asContext(
      await service.authenticateRequest(makeRequest(BEARER)),
    );

    expect(result.user?.address).toBe("0xuser");
    expect(result.auth_enabled).toBe(true);
    expect(result.admins).toEqual(ADMINS);
  });

  it("follows enabled=false: reads nothing", async () => {
    const service = new AuthService({ enabled: false, admins: ADMINS });

    const result = asContext(
      await service.authenticateRequest(makeRequest(BEARER)),
    );

    expect(result.user).toBeUndefined();
    expect(mockVerifyAuthBearerToken).not.toHaveBeenCalled();
  });
});

describe("resolveIdentity: false, enabled: true", () => {
  /* Contradictory on purpose, and worth pinning: enforcement with no way to
     identify anyone denies every non-admin, since no caller ever resolves. The
     combination is not one to configure — the test exists so the precedence is
     explicit rather than incidental. */
  it("reads no bearer even though the policy enforces", async () => {
    const service = new AuthService({
      enabled: true,
      resolveIdentity: false,
      admins: ADMINS,
      skipCredentialVerification: true,
    });

    const result = asContext(
      await service.authenticateRequest(makeRequest(BEARER)),
    );

    expect(result.user).toBeUndefined();
    expect(result.auth_enabled).toBe(true);
    expect(mockVerifyAuthBearerToken).not.toHaveBeenCalled();
  });
});

describe("verifyBearer() honours the same switch", () => {
  it("skips verification when identity is not resolved", async () => {
    const service = new AuthService({ enabled: false, admins: ADMINS });

    const result = asContext(await service.verifyBearer("Bearer token-abc"));

    expect(result.user).toBeUndefined();
    expect(result.auth_enabled).toBe(false);
    expect(mockVerifyAuthBearerToken).not.toHaveBeenCalled();
  });

  it("verifies when it is", async () => {
    const service = new AuthService({
      enabled: false,
      resolveIdentity: true,
      admins: ADMINS,
      skipCredentialVerification: true,
    });

    const result = asContext(await service.verifyBearer("Bearer token-abc"));

    expect(result.user?.address).toBe("0xuser");
    expect(result.auth_enabled).toBe(false);
  });
});
