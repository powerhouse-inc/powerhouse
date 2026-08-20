import { describe, expect, it } from "vitest";
import type { Signature } from "./signatures.js";
import { deserializeSignature, serializeSignature } from "./signatures.js";

const signature: Signature = [
  "1700000000",
  "did:key:z6Mk",
  "0xhash",
  "0xprev",
  "0xsig",
];

describe("carrying a signature as one string", () => {
  it("round-trips a signature", () => {
    expect(deserializeSignature(serializeSignature(signature))).toEqual(
      signature,
    );
  });

  it("passes an already-joined signature through unchanged", () => {
    expect(serializeSignature("a, b, c, d, e")).toBe("a, b, c, d, e");
  });

  it("passes a tuple through unchanged", () => {
    expect(deserializeSignature(signature)).toEqual(signature);
  });

  it("pads a short signature to the full width", () => {
    // Verification reads the params by position, so a short one has to keep its
    // shape and fail on the wrong param rather than on its length.
    expect(deserializeSignature("a, b")).toEqual(["a", "b", "", "", ""]);
  });

  it("pads an empty signature", () => {
    expect(deserializeSignature("")).toEqual(["", "", "", "", ""]);
  });

  it("does not split a param that contains the separator's comma", () => {
    // Only ", " separates params, so a lone comma inside one survives.
    expect(deserializeSignature("a,b, c, d, e, f")).toEqual([
      "a,b",
      "c",
      "d",
      "e",
      "f",
    ]);
  });
});
