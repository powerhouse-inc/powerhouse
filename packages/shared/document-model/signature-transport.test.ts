import { describe, expect, it } from "vitest";
import type { Signature } from "./signatures.js";
import {
  SIGNATURE_SCHEME_LEGACY,
  SIGNATURE_SCHEME_V2,
  deserializeSignature,
  serializeSignature,
} from "./signatures.js";

const signature: Signature = [
  "1700000000",
  "did:key:z6Mk",
  "0xhash",
  "0xprev",
  "0xsig",
  SIGNATURE_SCHEME_V2,
];

/** A signature written before the scheme field existed: five params, no scheme. */
const legacySignature: Signature = [
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

  it("carries the scheme as the sixth param", () => {
    expect(serializeSignature(signature)).toBe(
      "1700000000, did:key:z6Mk, 0xhash, 0xprev, 0xsig, v2",
    );
  });

  it("passes an already-joined signature through unchanged", () => {
    expect(serializeSignature("a, b, c, d, e, f")).toBe("a, b, c, d, e, f");
  });

  it("passes a tuple through unchanged", () => {
    expect(deserializeSignature(signature)).toEqual(signature);
  });

  it("serializes a legacy signature to exactly five params", () => {
    // No scheme means no sixth param and no trailing separator, so
    // re-transporting a stored legacy signature does not rewrite it.
    const wire = serializeSignature(legacySignature);
    expect(wire).toBe("1700000000, did:key:z6Mk, 0xhash, 0xprev, 0xsig");
    expect(wire.split(", ")).toHaveLength(5);
    expect(wire.endsWith(", ")).toBe(false);
  });

  it("serializes an explicitly-legacy signature to exactly five params", () => {
    // An empty scheme is legacy, so it is omitted rather than carried as an
    // empty sixth param.
    const wire = serializeSignature([
      legacySignature[0],
      legacySignature[1],
      legacySignature[2],
      legacySignature[3],
      legacySignature[4],
      SIGNATURE_SCHEME_LEGACY,
    ]);
    expect(wire).toBe("1700000000, did:key:z6Mk, 0xhash, 0xprev, 0xsig");
  });

  it("deserializes a five-param wire value with an empty scheme", () => {
    // Padding to an empty scheme is exactly what a legacy signature means.
    const deserialized = deserializeSignature(
      serializeSignature(legacySignature),
    );
    expect(deserialized).toHaveLength(6);
    expect(deserialized[5]).toBe(SIGNATURE_SCHEME_LEGACY);
    expect(deserialized).toEqual([
      "1700000000",
      "did:key:z6Mk",
      "0xhash",
      "0xprev",
      "0xsig",
      "",
    ]);
  });

  it("pads a short signature to the full width", () => {
    // Verification reads the params by position, so a short one has to keep its
    // shape and fail on the wrong param rather than on its length.
    expect(deserializeSignature("a, b")).toEqual(["a", "b", "", "", "", ""]);
  });

  it("pads an empty signature", () => {
    expect(deserializeSignature("")).toEqual(["", "", "", "", "", ""]);
  });

  it("drops params beyond the sixth", () => {
    expect(deserializeSignature("a, b, c, d, e, f, g")).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
      "f",
    ]);
  });

  it("does not split a param that contains the separator's comma", () => {
    // Only ", " separates params, so a lone comma inside one survives.
    expect(deserializeSignature("a,b, c, d, e, f, g")).toEqual([
      "a,b",
      "c",
      "d",
      "e",
      "f",
      "g",
    ]);
  });
});
