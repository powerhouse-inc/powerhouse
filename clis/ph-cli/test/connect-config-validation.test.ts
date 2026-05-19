import { describe, expect, it } from "vitest";
import {
  normalizeKey,
  parseCliValue,
  validateConnectKeyValue,
  validateConnectPatch,
} from "../src/utils/connect-config-validation.js";

describe("parseCliValue", () => {
  it("parses JSON-shaped inputs into typed values", () => {
    expect(parseCliValue("true")).toBe(true);
    expect(parseCliValue("false")).toBe(false);
    expect(parseCliValue("42")).toBe(42);
    expect(parseCliValue("null")).toBe(null);
    expect(parseCliValue('"x"')).toBe("x");
    expect(parseCliValue("[1,2,3]")).toEqual([1, 2, 3]);
  });

  it("falls back to the raw string for non-JSON input", () => {
    expect(parseCliValue("https://example.com")).toBe("https://example.com");
    expect(parseCliValue("preserve-all")).toBe("preserve-all");
    expect(parseCliValue("info")).toBe("info");
  });
});

describe("normalizeKey", () => {
  it("strips the optional connect. prefix", () => {
    expect(normalizeKey("connect.renown.url")).toBe("renown.url");
    expect(normalizeKey("renown.url")).toBe("renown.url");
  });
});

describe("validateConnectKeyValue", () => {
  it("returns a partial for valid path + value", () => {
    expect(validateConnectKeyValue("connect.renown.url", "https://x")).toEqual({
      renown: { url: "https://x" },
    });
  });

  it("accepts the bare path (no connect. prefix)", () => {
    expect(validateConnectKeyValue("renown.url", "https://x")).toEqual({
      renown: { url: "https://x" },
    });
  });

  it("coerces typed values via parseCliValue", () => {
    expect(validateConnectKeyValue("renown.chainId", "137")).toEqual({
      renown: { chainId: 137 },
    });
    expect(validateConnectKeyValue("drives.allowAddDrive", "false")).toEqual({
      drives: { allowAddDrive: false },
    });
  });

  it("throws on empty key", () => {
    expect(() => validateConnectKeyValue("", "foo")).toThrow(
      /key cannot be empty/,
    );
    expect(() => validateConnectKeyValue("connect.", "foo")).toThrow(
      /key cannot be empty/,
    );
  });

  it("throws on unknown path (catches typos)", () => {
    expect(() => validateConnectKeyValue("connect.reonwn.url", "x")).toThrow(
      /must NOT have additional properties/,
    );
  });

  it("throws on type mismatch (string where number expected)", () => {
    expect(() =>
      validateConnectKeyValue("renown.chainId", "not-a-number"),
    ).toThrow(/must be number/);
  });

  it("throws on type mismatch (number where boolean expected)", () => {
    expect(() => validateConnectKeyValue("drives.allowAddDrive", "42")).toThrow(
      /must be boolean/,
    );
  });
});

describe("validateConnectPatch", () => {
  it("validates and returns a well-shaped partial", () => {
    expect(
      validateConnectPatch('{"renown":{"url":"https://x","chainId":42}}'),
    ).toEqual({ renown: { url: "https://x", chainId: 42 } });
  });

  it("accepts a multi-section patch", () => {
    const raw =
      '{"drives":{"allowAddDrive":false,"sections":{"local":{"enabled":false}}},"renown":{"chainId":137}}';
    expect(validateConnectPatch(raw)).toEqual({
      drives: {
        allowAddDrive: false,
        sections: { local: { enabled: false } },
      },
      renown: { chainId: 137 },
    });
  });

  it("throws on malformed JSON", () => {
    expect(() => validateConnectPatch("not-json")).toThrow(/invalid JSON/);
  });

  it("throws on non-object root", () => {
    expect(() => validateConnectPatch('"a string"')).toThrow(
      /must be a JSON object/,
    );
    expect(() => validateConnectPatch("[1,2,3]")).toThrow(
      /must be a JSON object/,
    );
  });

  it("throws on unknown top-level key", () => {
    expect(() => validateConnectPatch('{"unknownKey":{"foo":"bar"}}')).toThrow(
      /must NOT have additional properties/,
    );
  });

  it("throws on type mismatch inside a known section", () => {
    expect(() => validateConnectPatch('{"renown":{"chainId":"abc"}}')).toThrow(
      /must be number/,
    );
  });
});
