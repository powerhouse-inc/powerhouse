import { privateKeyToAccount } from "viem/accounts";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildAndSignCredential,
  type SignCredentialTypedData,
} from "../src/credential.js";
import { createLocalCredentialVerifier } from "../src/local-credential-verifier.js";
import type { PowerhouseVerifiableCredential } from "../src/types.js";

// Well-known Anvil dev key; never used for anything real.
const KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const account = privateKeyToAccount(KEY);
const APP_DID = "did:key:test-app";

const sign: SignCredentialTypedData = (args) =>
  account.signTypedData(args as Parameters<typeof account.signTypedData>[0]);

const validCredential = () =>
  buildAndSignCredential({
    signTypedData: sign,
    address: account.address,
    chainId: 1,
    app: "test-app",
    appId: APP_DID,
  });

// Flatten a signed credential into a `renownCredentials` read-model row.
const toFlatRow = (c: PowerhouseVerifiableCredential) => ({
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

const signer = () => ({
  address: account.address,
  chainId: 1,
  appId: APP_DID,
});

describe("createLocalCredentialVerifier", () => {
  afterEach(() => vi.restoreAllMocks());

  it("accepts a live credential read through the executor", async () => {
    const execute = vi.fn().mockResolvedValue({
      renownCredentials: [toFlatRow(await validCredential())],
    });
    const verify = createLocalCredentialVerifier(execute);

    expect(await verify(signer())).toBe(true);
    const [query, variables] = execute.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(query).toContain("renownCredentials");
    expect(variables).toHaveProperty("input");
  });

  it("never touches the network", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const execute = vi.fn().mockResolvedValue({
      renownCredentials: [toFlatRow(await validCredential())],
    });

    await createLocalCredentialVerifier(execute)(signer());

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects when the read model has no credential", async () => {
    const execute = vi.fn().mockResolvedValue({ renownCredentials: [] });
    expect(await createLocalCredentialVerifier(execute)(signer())).toBe(false);
  });

  it("rejects a credential delegated to another app", async () => {
    const execute = vi.fn().mockResolvedValue({
      renownCredentials: [toFlatRow(await validCredential())],
    });
    const verify = createLocalCredentialVerifier(execute);

    expect(await verify({ ...signer(), appId: "did:key:other-app" })).toBe(
      false,
    );
  });

  it("rejects a tampered proof", async () => {
    const credential = await validCredential();
    credential.proof.proofValue = "0xdeadbeef";
    const execute = vi
      .fn()
      .mockResolvedValue({ renownCredentials: [toFlatRow(credential)] });

    expect(await createLocalCredentialVerifier(execute)(signer())).toBe(false);
  });

  // The SDK turns a read failure into "no credential" — fail closed, but the
  // host needs to hear about it.
  it("reports a read failure and fails closed", async () => {
    const error = new Error("read model down");
    const onError = vi.fn();
    const execute = vi.fn().mockRejectedValue(error);

    const result = await createLocalCredentialVerifier(execute, { onError })(
      signer(),
    );

    expect(result).toBe(false);
    expect(onError).toHaveBeenCalledWith(error);
  });
});
