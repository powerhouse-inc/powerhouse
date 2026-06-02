import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import {
  buildAndSignCredential,
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
