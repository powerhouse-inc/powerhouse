import { describe, expect, it } from "vitest";
import { MemoryKeyStorage, RenownCryptoBuilder } from "../src/crypto/index.js";
import { verifyAuthBearerToken } from "../src/utils.js";

async function tokenChainId(crypto: {
  getBearerToken: (address: string) => Promise<string>;
}): Promise<number | undefined> {
  const verified = await verifyAuthBearerToken(
    await crypto.getBearerToken("0x123"),
  );
  if (!verified) throw new Error("bearer token did not verify");
  return verified.verifiableCredential.credentialSubject.chainId;
}

describe("auth", () => {
  it("should reject an invalid token", async () => {
    const verified = await verifyAuthBearerToken("invalid-token");
    expect(verified).toBeFalsy();
  });

  it("should be able to authenticate a user", async () => {
    const renownCrypto = await new RenownCryptoBuilder()
      .withKeyPairStorage(new MemoryKeyStorage())
      .build();
    const token = await renownCrypto.getBearerToken("0x123");
    const verified = await verifyAuthBearerToken(token);
    expect(verified).not.toBeFalsy();
  });

  it("should reject a tampered token", async () => {
    const renownCrypto = await new RenownCryptoBuilder()
      .withKeyPairStorage(new MemoryKeyStorage())
      .build();
    const token = await renownCrypto.getBearerToken("0x123");
    const tampered = await verifyAuthBearerToken(token + "invalid");
    expect(tampered).toBeFalsy();
  });

  it("defaults the token's chain to 1", async () => {
    const renownCrypto = await new RenownCryptoBuilder()
      .withKeyPairStorage(new MemoryKeyStorage())
      .build();
    expect(renownCrypto.chainId).toBe(1);
    expect(await tokenChainId(renownCrypto)).toBe(1);
  });

  // The token used to be pinned to chain 1 regardless of the issuing chain.
  it("scopes the token to the configured chain", async () => {
    const renownCrypto = await new RenownCryptoBuilder()
      .withKeyPairStorage(new MemoryKeyStorage())
      .withChainId(137)
      .build();
    expect(renownCrypto.chainId).toBe(137);
    expect(await tokenChainId(renownCrypto)).toBe(137);
  });
});
