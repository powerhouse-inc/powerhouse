import { generatePrivateKey, getAuthenticatedDID } from "@didtools/key-did";
import { EdDSASigner } from "did-jwt";
import { type Issuer } from "did-jwt-vc";
import { describe, expect, it } from "vitest";
import { createAuthBearerToken, verifyAuthBearerToken } from "../src/utils.js";

describe("auth", () => {
  it("should be able to authenticate a user", async () => {
    const randomKey = generatePrivateKey();
    const did = await getAuthenticatedDID(randomKey);
    const signer = EdDSASigner(randomKey);

    const issuer: Issuer = {
      did: did.id,
      signer,
      alg: "EdDSA",
    };

    const token = await createAuthBearerToken(1, "test", "test", issuer);
    const verified = await verifyAuthBearerToken(token);
    expect(verified).toBeDefined();
  });
});
