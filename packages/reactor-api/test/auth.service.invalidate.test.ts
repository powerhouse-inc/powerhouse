/**
 * AuthService.invalidateCredential(): a package's revoke mutation evicts the
 * cached positive credential check synchronously, so the next request
 * re-verifies instead of riding the cache for up to its TTL.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AuthService,
  createCredentialInvalidator,
} from "../src/services/auth.service.js";

const mockVerifyAuthBearerToken = vi.fn();
const mockVerifyCredential = vi.fn();

vi.mock("@renown/sdk", () => ({
  verifyAuthBearerToken: (...args: unknown[]) =>
    mockVerifyAuthBearerToken(...args),
}));

function makeVerified(address: string, chainId: number, issuer: string) {
  return {
    verifiableCredential: {
      credentialSubject: { address, chainId, networkId: "eip155" },
    },
    issuer,
  };
}

function makeService() {
  return new AuthService({
    enabled: true,
    admins: [],
    credentialVerificationCacheTtlMs: 60_000,
    verifyCredential: mockVerifyCredential,
  });
}

async function authenticateAs(
  service: AuthService,
  address: string,
  chainId = 1,
  issuer = "did:key:app1",
) {
  mockVerifyAuthBearerToken.mockResolvedValueOnce(
    makeVerified(address, chainId, issuer),
  );
  return service.verifyBearer("Bearer token");
}

describe("AuthService.invalidateCredential()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyCredential.mockResolvedValue(true);
  });

  it("evicts a cached positive check so a revoked credential is refused at once", async () => {
    const service = makeService();
    expect(await authenticateAs(service, "0xUser")).not.toBeInstanceOf(
      Response,
    );

    // Revoked upstream; without invalidation the cache would still admit it.
    mockVerifyCredential.mockResolvedValue(false);
    expect(await authenticateAs(service, "0xUser")).not.toBeInstanceOf(
      Response,
    );

    expect(service.invalidateCredential("0xuser", 1, "did:key:app1")).toBe(1);
    const refused = await authenticateAs(service, "0xUser");
    expect(refused).toBeInstanceOf(Response);
    expect((refused as Response).status).toBe(401);
  });

  it("evicts every app key and chain of an address when only the address is given", async () => {
    const service = makeService();
    await authenticateAs(service, "0xuser", 1, "did:key:app1");
    await authenticateAs(service, "0xuser", 1, "did:key:app2");
    await authenticateAs(service, "0xuser", 5, "did:key:app1");
    await authenticateAs(service, "0xother", 1, "did:key:app1");
    expect(mockVerifyCredential).toHaveBeenCalledTimes(4);

    expect(service.invalidateCredential("0xUSER")).toBe(3);

    await authenticateAs(service, "0xother", 1, "did:key:app1");
    expect(mockVerifyCredential).toHaveBeenCalledTimes(4);
    await authenticateAs(service, "0xuser", 1, "did:key:app2");
    expect(mockVerifyCredential).toHaveBeenCalledTimes(5);
  });

  it("narrows by chainId and app DID when given", async () => {
    const service = makeService();
    await authenticateAs(service, "0xuser", 1, "did:key:app1");
    await authenticateAs(service, "0xuser", 1, "did:key:app2");
    await authenticateAs(service, "0xuser", 5, "did:key:app1");

    expect(
      service.invalidateCredential("0xuser", undefined, "did:key:app1"),
    ).toBe(2);
    expect(service.invalidateCredential("0xuser", 1)).toBe(1);
    expect(service.invalidateCredential("0xuser", 1)).toBe(0);
  });

  it("notifies listeners even when nothing was cached, and stops after unsubscribe", () => {
    const service = makeService();
    const listener = vi.fn();
    const unsubscribe = service.onCredentialInvalidated(listener);

    service.invalidateCredential("0xUser", 1, "did:key:app1");
    expect(listener).toHaveBeenCalledWith({
      address: "0xuser",
      chainId: 1,
      appDid: "did:key:app1",
    });

    unsubscribe();
    service.invalidateCredential("0xuser");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does not let a throwing listener break invalidation", () => {
    const service = makeService();
    service.onCredentialInvalidated(() => {
      throw new Error("boom");
    });
    const second = vi.fn();
    service.onCredentialInvalidated(second);
    expect(() => service.invalidateCredential("0xuser")).not.toThrow();
    expect(second).toHaveBeenCalled();
  });
});

describe("AuthService.isCredentialValid()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const user = {
    address: "0xuser",
    chainId: 1,
    networkId: "eip155",
    appKey: "did:key:app1",
  };

  it("re-checks the credential through the verifier", async () => {
    mockVerifyCredential.mockResolvedValue(false);
    expect(await makeService().isCredentialValid(user)).toBe(false);
    expect(mockVerifyCredential).toHaveBeenCalledWith({
      address: "0xuser",
      chainId: 1,
      appId: "did:key:app1",
    });
  });

  it("is always true when credential verification is skipped", async () => {
    const service = new AuthService({
      enabled: true,
      admins: [],
      skipCredentialVerification: true,
    });
    expect(await service.isCredentialValid(user)).toBe(true);
  });
});

describe("createCredentialInvalidator()", () => {
  it("forwards to the auth service", () => {
    const service = makeService();
    const spy = vi.spyOn(service, "invalidateCredential");
    createCredentialInvalidator(service).invalidateCredential(
      "0xuser",
      1,
      "did:key:app1",
    );
    expect(spy).toHaveBeenCalledWith("0xuser", 1, "did:key:app1");
  });

  it("is a no-op without an auth service", () => {
    expect(
      createCredentialInvalidator(undefined).invalidateCredential("0xuser"),
    ).toBe(0);
  });
});
