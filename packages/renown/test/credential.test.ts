import { privateKeyToAccount } from "viem/accounts";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildAndSignCredential,
  fetchDelegationCredential,
  recoverCredentialSigner,
  verifyCredentialSignature,
  type SignCredentialTypedData,
} from "../src/credential.js";

// Well-known Anvil dev keys; never used for anything real.
const KEY_1 =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const KEY_2 =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

const account = privateKeyToAccount(KEY_1);

// A plain viem local account works directly: the SDK strips the reserved
// EIP712Domain key before calling the signer.
const sign: SignCredentialTypedData = (args) =>
  account.signTypedData(args as Parameters<typeof account.signTypedData>[0]);

describe("credential", () => {
  it("builds, signs, and verifies a credential round-trip", async () => {
    const credential = await buildAndSignCredential({
      signTypedData: sign,
      address: account.address,
      chainId: 1,
      app: "test-app",
      appId: "did:key:test-app",
    });

    expect(credential.proof.type).toBe("EthereumEip712Signature2021");
    expect(credential.issuer.ethereumAddress).toBe(account.address);

    const recovered = await recoverCredentialSigner(credential);
    expect(recovered.toLowerCase()).toBe(account.address.toLowerCase());
    expect(await verifyCredentialSignature(credential)).toBe(true);
  });

  it("rejects a tampered credential body", async () => {
    const credential = await buildAndSignCredential({
      signTypedData: sign,
      address: account.address,
      chainId: 1,
      app: "test-app",
      appId: "did:key:test-app",
    });

    credential.credentialSubject.app = "did:test:evil-app";
    expect(await verifyCredentialSignature(credential)).toBe(false);
  });

  it("rejects an issuer-address swap", async () => {
    const credential = await buildAndSignCredential({
      signTypedData: sign,
      address: account.address,
      chainId: 1,
      app: "test-app",
      appId: "did:key:test-app",
    });

    credential.issuer.ethereumAddress = privateKeyToAccount(KEY_2).address;
    expect(await verifyCredentialSignature(credential)).toBe(false);
  });

  it("returns false for a malformed proof instead of throwing", async () => {
    const credential = await buildAndSignCredential({
      signTypedData: sign,
      address: account.address,
      chainId: 1,
      app: "test-app",
      appId: "did:key:test-app",
    });

    credential.proof.proofValue = "not-hex";
    expect(await verifyCredentialSignature(credential)).toBe(false);
  });
});

describe("fetchDelegationCredential", () => {
  const APP_DID = "did:key:test-app";
  const BASE = "https://renown.test";

  const validCredential = () =>
    buildAndSignCredential({
      signTypedData: sign,
      address: account.address,
      chainId: 1,
      app: "test-app",
      appId: APP_DID,
    });

  const mockFetch = (body: unknown, status = 200) =>
    vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(body), { status }));

  afterEach(() => vi.restoreAllMocks());

  it("returns the credential when it exists and the proof verifies", async () => {
    mockFetch({ credential: await validCredential() });
    const result = await fetchDelegationCredential({
      address: account.address,
      chainId: 1,
      appDid: APP_DID,
      baseUrl: BASE,
    });
    expect(result?.credentialSubject.id).toBe(APP_DID);
  });

  it("returns undefined when it delegates to a different app DID", async () => {
    mockFetch({ credential: await validCredential() });
    const result = await fetchDelegationCredential({
      address: account.address,
      chainId: 1,
      appDid: "did:key:other-app",
      baseUrl: BASE,
    });
    expect(result).toBeUndefined();
  });

  it("returns undefined when the address does not match the issuer", async () => {
    mockFetch({ credential: await validCredential() });
    const result = await fetchDelegationCredential({
      address: privateKeyToAccount(KEY_2).address,
      chainId: 1,
      appDid: APP_DID,
      baseUrl: BASE,
    });
    expect(result).toBeUndefined();
  });

  it("returns undefined on a non-200 response", async () => {
    mockFetch({}, 503);
    const result = await fetchDelegationCredential({
      address: account.address,
      chainId: 1,
      appDid: APP_DID,
      baseUrl: BASE,
    });
    expect(result).toBeUndefined();
  });

  it("returns undefined for an expired credential", async () => {
    const credential = await buildAndSignCredential({
      signTypedData: sign,
      address: account.address,
      chainId: 1,
      app: "test-app",
      appId: APP_DID,
      expiresInDays: -1,
    });
    mockFetch({ credential });
    const result = await fetchDelegationCredential({
      address: account.address,
      chainId: 1,
      appDid: APP_DID,
      baseUrl: BASE,
    });
    expect(result).toBeUndefined();
  });

  it("returns undefined for a malformed expirationDate (not treated as non-expiring)", async () => {
    const credential = await validCredential();
    credential.expirationDate = "not-a-date";
    mockFetch({ credential });
    const result = await fetchDelegationCredential({
      address: account.address,
      chainId: 1,
      appDid: APP_DID,
      baseUrl: BASE,
    });
    expect(result).toBeUndefined();
  });

  it("returns undefined when the EIP-712 proof is invalid", async () => {
    const credential = await validCredential();
    credential.proof.proofValue = "0xdeadbeef";
    mockFetch({ credential });
    const result = await fetchDelegationCredential({
      address: account.address,
      chainId: 1,
      appDid: APP_DID,
      baseUrl: BASE,
    });
    expect(result).toBeUndefined();
  });

  it("skips signature verification when verifySignature is false", async () => {
    const credential = await validCredential();
    credential.proof.proofValue = "0xdeadbeef";
    mockFetch({ credential });
    const result = await fetchDelegationCredential({
      address: account.address,
      chainId: 1,
      appDid: APP_DID,
      baseUrl: BASE,
      verifySignature: false,
    });
    expect(result?.credentialSubject.id).toBe(APP_DID);
  });
});
