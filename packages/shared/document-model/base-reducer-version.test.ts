import { describe, expect, it } from "vitest";
import { baseReducerVersion } from "./base-reducer-protocol.js";
import type { PHDocumentHeader } from "./documents.js";

function header(
  protocolVersions: Record<string, number> | undefined,
): PHDocumentHeader {
  return { id: "doc-1", protocolVersions } as PHDocumentHeader;
}

describe("baseReducerVersion", () => {
  it("returns a known version", () => {
    expect(baseReducerVersion(header({ "base-reducer": 1 }))).toBe(1);
    expect(baseReducerVersion(header({ "base-reducer": 2 }))).toBe(2);
    expect(baseReducerVersion(header({ "base-reducer": 3 }))).toBe(3);
  });

  it("throws on a missing version", () => {
    expect(() => baseReducerVersion(header(undefined))).toThrow(
      "Document doc-1 carries no base-reducer protocol version",
    );
  });

  it("throws on an unknown version", () => {
    expect(() => baseReducerVersion(header({ "base-reducer": 7 }))).toThrow(
      "Document doc-1 carries unknown base-reducer protocol version 7",
    );
  });
});
