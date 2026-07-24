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

// Extract the request URL as a string across the fetch input union.
const toUrl = (input: string | URL | Request): string =>
  typeof input === "string"
    ? input
    : input instanceof URL
      ? input.href
      : input.url;

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

  // Route the discovery probe to a 404 (no switchboard advertised) so these
  // tests exercise the REST fallback; a fresh Response per call avoids reuse.
  const mockFetch = (body: unknown, status = 200) =>
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (toUrl(input).includes("/api/switchboard")) {
        return Promise.resolve(new Response("Not found", { status: 404 }));
      }
      return Promise.resolve(new Response(JSON.stringify(body), { status }));
    });

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

  const SB = "http://sb.test/graphql";

  // Flatten a signed credential into the `renownCredentials` read-model row.
  const toFlatRow = (c: Awaited<ReturnType<typeof validCredential>>) => ({
    documentId: "doc-1",
    credentialId: c.id,
    context: c["@context"],
    type: c.type,
    issuerId: c.issuer.id,
    issuerEthereumAddress: c.issuer.ethereumAddress,
    issuanceDate: c.issuanceDate,
    expirationDate: c.expirationDate,
    credentialSubjectId: c.credentialSubject.id,
    credentialSubjectApp: c.credentialSubject.app,
    credentialStatusId: null,
    credentialStatusType: null,
    credentialSchemaId: c.credentialSchema.id,
    credentialSchemaType: c.credentialSchema.type,
    proofVerificationMethod: c.proof.verificationMethod,
    proofEthereumAddress: c.proof.ethereumAddress,
    proofCreated: c.proof.created,
    proofPurpose: c.proof.proofPurpose,
    proofType: c.proof.type,
    proofValue: c.proof.proofValue,
    proofEip712Domain: JSON.stringify(c.proof.eip712.domain),
    proofEip712PrimaryType: c.proof.eip712.primaryType,
    revoked: false,
  });

  // Route discovery + switchboard GraphQL responses by URL.
  const mockSwitchboard = (rows: unknown[], endpoint?: string) =>
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (toUrl(input).includes("/api/switchboard")) {
        return Promise.resolve(
          new Response(JSON.stringify({ endpoint }), { status: 200 }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ data: { renownCredentials: rows } }), {
          status: 200,
        }),
      );
    });

  it("reads from the switchboard when an explicit endpoint is given", async () => {
    mockSwitchboard([toFlatRow(await validCredential())]);
    const result = await fetchDelegationCredential({
      address: account.address,
      chainId: 1,
      appDid: APP_DID,
      switchboardUrl: SB,
    });
    expect(result?.credentialSubject.id).toBe(APP_DID);
  });

  it("uses the switchboard when discovery advertises an endpoint", async () => {
    mockSwitchboard([toFlatRow(await validCredential())], SB);
    const result = await fetchDelegationCredential({
      address: account.address,
      chainId: 1,
      appDid: APP_DID,
      baseUrl: BASE,
    });
    expect(result?.credentialSubject.id).toBe(APP_DID);
  });

  it("re-verifies the signature on the switchboard path", async () => {
    const credential = await validCredential();
    credential.proof.proofValue = "0xdeadbeef";
    mockSwitchboard([toFlatRow(credential)]);
    const result = await fetchDelegationCredential({
      address: account.address,
      chainId: 1,
      appDid: APP_DID,
      switchboardUrl: SB,
    });
    expect(result).toBeUndefined();
  });

  it("skips the discovery probe and uses REST when discover is false", async () => {
    const probe = vi.fn();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (toUrl(input).includes("/api/switchboard")) {
        probe();
        return new Response(JSON.stringify({ endpoint: SB }), { status: 200 });
      }
      return new Response(
        JSON.stringify({ credential: await validCredential() }),
        { status: 200 },
      );
    });
    const result = await fetchDelegationCredential({
      address: account.address,
      chainId: 1,
      appDid: APP_DID,
      baseUrl: BASE,
      discover: false,
    });
    // Discovery was never probed even though an endpoint was available.
    expect(probe).not.toHaveBeenCalled();
    expect(result?.credentialSubject.id).toBe(APP_DID);
  });
});
