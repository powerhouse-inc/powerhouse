import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRenownCredentialVerifier } from "../src/services/renown-credential-verifier.js";

const mockFetchDelegationCredential = vi.fn();
const mockResolveSwitchboardEndpoint = vi.fn();

vi.mock("@renown/sdk", () => ({
  fetchDelegationCredential: (...args: unknown[]) =>
    mockFetchDelegationCredential(...args),
  resolveSwitchboardEndpoint: (...args: unknown[]) =>
    mockResolveSwitchboardEndpoint(...args),
}));

describe("createRenownCredentialVerifier", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns true when a credential is found", async () => {
    mockResolveSwitchboardEndpoint.mockResolvedValue(undefined);
    mockFetchDelegationCredential.mockResolvedValue({ id: "urn:uuid:x" });
    const verify = await createRenownCredentialVerifier();
    const result = await verify({
      address: "0xabc",
      chainId: 1,
      appId: "did:key:app",
    });
    expect(result).toBe(true);
  });

  it("returns false when no credential is found", async () => {
    mockResolveSwitchboardEndpoint.mockResolvedValue(undefined);
    mockFetchDelegationCredential.mockResolvedValue(undefined);
    const verify = await createRenownCredentialVerifier();
    const result = await verify({
      address: "0xabc",
      chainId: 1,
      appId: "did:key:app",
    });
    expect(result).toBe(false);
  });

  it("resolves discovery once at creation, not per verify", async () => {
    mockResolveSwitchboardEndpoint.mockResolvedValue("http://sb.test/graphql");
    mockFetchDelegationCredential.mockResolvedValue(undefined);
    const verify = await createRenownCredentialVerifier({
      renownUrl: "http://renown.test",
    });

    await verify({ address: "0xabc", chainId: 1, appId: "did:key:app" });
    await verify({ address: "0xabc", chainId: 1, appId: "did:key:app" });

    // Discovery ran exactly once; every verify reuses the resolved endpoint.
    expect(mockResolveSwitchboardEndpoint).toHaveBeenCalledTimes(1);
    expect(mockFetchDelegationCredential).toHaveBeenCalledWith({
      address: "0xabc",
      chainId: 1,
      appDid: "did:key:app",
      switchboardUrl: "http://sb.test/graphql",
      baseUrl: undefined,
      discover: false,
    });
  });

  it("falls back to REST against renownUrl when no switchboard is found", async () => {
    mockResolveSwitchboardEndpoint.mockResolvedValue(undefined);
    mockFetchDelegationCredential.mockResolvedValue(undefined);
    const verify = await createRenownCredentialVerifier({
      renownUrl: "http://renown.test",
    });
    await verify({ address: "0xABC", chainId: 137, appId: "did:key:app" });
    expect(mockFetchDelegationCredential).toHaveBeenCalledWith({
      address: "0xABC",
      chainId: 137,
      appDid: "did:key:app",
      switchboardUrl: undefined,
      baseUrl: "http://renown.test",
      discover: false,
    });
  });
});
