import { generatePrivateKey } from "@didtools/key-did";
import { describe, expect, it } from "vitest";
import {
  createAuthBearerToken,
  getIssuer,
  verifyAuthBearerToken,
} from "../src/utils.js";

describe("auth", () => {
  it("should be able to authenticate a user", async () => {
    const randomKey = generatePrivateKey();
    const issuer = await getIssuer(randomKey);
    const token = await createAuthBearerToken(1, "test", "test", issuer);
    const verified = await verifyAuthBearerToken(token);
    expect(verified).toBeDefined();
  });
});
