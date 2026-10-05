import { describe, expect, it } from "vitest";
import {
  InvalidSecretRefError,
  isSecretRef,
  parseSecretRef,
  SECRET_REF_PREFIX,
  secretRefFromId,
} from "../../../src/pieces/index.js";

const ID = "9f2c4a1e8b7d40329fd1c05a6e83b217";

describe("secret refs", () => {
  it("round-trips id <-> ref", () => {
    const ref = secretRefFromId(ID);
    expect(ref).toBe(`${SECRET_REF_PREFIX}${ID}`);
    expect(parseSecretRef(ref)).toBe(ID);
    expect(isSecretRef(ref)).toBe(true);
  });

  it("rejects everything that is not secret://v1:<32 hex>", () => {
    for (const ref of [
      "DISCORD_BOT_TOKEN",
      "secret://v1:",
      "secret://v1:short",
      `secret://v2:${ID}`,
      `secret://v1:${ID.toUpperCase()}`,
      `secret://v1:${ID}0`,
      ` ${SECRET_REF_PREFIX}${ID}`,
    ]) {
      expect(isSecretRef(ref), ref).toBe(false);
      expect(() => parseSecretRef(ref), ref).toThrow(InvalidSecretRefError);
    }
  });

  it("rejects invalid ids when building refs", () => {
    expect(() => secretRefFromId("nope")).toThrow(InvalidSecretRefError);
  });
});
