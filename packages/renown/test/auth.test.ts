import { describe, expect, it } from "vitest";
import { MemoryKeyStorage, RenownCryptoBuilder } from "../src/crypto/index.js";
import { verifyAuthBearerToken } from "../src/utils.js";

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
});
