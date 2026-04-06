import { describe, expect, it } from "vitest";
import {
  decodeCompositeCursor,
  encodeCompositeCursor,
  isCompositeCursor,
} from "../../src/client/cursor.js";

describe("Composite Cursor Utilities", () => {
  describe("isCompositeCursor", () => {
    it("should return true for composite cursors", () => {
      expect(isCompositeCursor('c:{"global":"1"}')).toBe(true);
      expect(isCompositeCursor("c:{}")).toBe(true);
    });

    it("should return false for simple integer cursors", () => {
      expect(isCompositeCursor("5")).toBe(false);
      expect(isCompositeCursor("0")).toBe(false);
      expect(isCompositeCursor("123")).toBe(false);
    });

    it("should return false for empty string", () => {
      expect(isCompositeCursor("")).toBe(false);
    });
  });

  describe("encodeCompositeCursor", () => {
    it("should produce a string starting with the composite prefix", () => {
      const result = encodeCompositeCursor({ global: "1" });
      expect(result).toMatch(/^c:/);
    });

    it("should encode scope cursors as JSON after the prefix", () => {
      const result = encodeCompositeCursor({ global: "1", document: "3" });
      expect(result).toBe('c:{"global":"1","document":"3"}');
    });

    it("should encode an empty map", () => {
      const result = encodeCompositeCursor({});
      expect(result).toBe("c:{}");
    });
  });

  describe("decodeCompositeCursor", () => {
    it("should round-trip with encodeCompositeCursor", () => {
      const cursors = { global: "1", document: "3" };
      const encoded = encodeCompositeCursor(cursors);
      const decoded = decodeCompositeCursor(encoded);
      expect(decoded).toEqual(cursors);
    });

    it("should decode a single-scope composite cursor", () => {
      const decoded = decodeCompositeCursor('c:{"global":"2"}');
      expect(decoded).toEqual({ global: "2" });
    });

    it("should throw on a non-composite cursor", () => {
      expect(() => decodeCompositeCursor("5")).toThrow(
        "Invalid composite cursor format",
      );
    });

    it("should throw on invalid JSON after prefix", () => {
      expect(() => decodeCompositeCursor("c:not-json")).toThrow(
        "Invalid composite cursor format",
      );
    });

    it("should throw if parsed value is not an object", () => {
      expect(() => decodeCompositeCursor("c:[1,2,3]")).toThrow(
        "Invalid composite cursor format",
      );
    });

    it("should throw if parsed value is null", () => {
      expect(() => decodeCompositeCursor("c:null")).toThrow(
        "Invalid composite cursor format",
      );
    });
  });
});
