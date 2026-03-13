import { describe, expect, it } from "vitest";
import {
  duplicateKey,
  headKey,
  headPrefix,
  operationKey,
  operationPrefix,
  ordinalKey,
  ordinalPrefix,
  pad,
  parseOperationKey,
  ORDINAL_COUNTER_KEY,
} from "../../src/key-encoding.js";

describe("key-encoding", () => {
  describe("pad", () => {
    it("should pad numbers to 10 digits", () => {
      expect(pad(0)).toBe("0000000000");
      expect(pad(1)).toBe("0000000001");
      expect(pad(42)).toBe("0000000042");
      expect(pad(9999999999)).toBe("9999999999");
    });

    it("should preserve lexicographic ordering", () => {
      const nums = [0, 1, 9, 10, 99, 100, 999, 1000];
      const padded = nums.map(pad);
      const sorted = [...padded].sort();
      expect(padded).toEqual(sorted);
    });
  });

  describe("operationKey", () => {
    it("should produce correct key format", () => {
      expect(operationKey("doc-1", "global", "main", 0)).toBe(
        "op/doc-1/global/main/0000000000",
      );
      expect(operationKey("doc-1", "local", "draft", 42)).toBe(
        "op/doc-1/local/draft/0000000042",
      );
    });
  });

  describe("operationPrefix", () => {
    it("should produce prefix for range scans", () => {
      expect(operationPrefix("doc-1", "global", "main")).toBe(
        "op/doc-1/global/main/",
      );
    });
  });

  describe("ordinalKey", () => {
    it("should produce correct ordinal key", () => {
      expect(ordinalKey(0)).toBe("ord/0000000000");
      expect(ordinalKey(123)).toBe("ord/0000000123");
    });
  });

  describe("ordinalPrefix", () => {
    it("should return the ordinal prefix", () => {
      expect(ordinalPrefix()).toBe("ord/");
    });
  });

  describe("duplicateKey", () => {
    it("should encode opId, index, and skip", () => {
      expect(duplicateKey("op-1", 0, 0)).toBe("dup/op-1/0000000000/0000000000");
      expect(duplicateKey("op-1", 5, 2)).toBe("dup/op-1/0000000005/0000000002");
    });
  });

  describe("headKey", () => {
    it("should produce correct head metadata key", () => {
      expect(headKey("doc-1", "global", "main")).toBe(
        "_meta/head/doc-1/global/main",
      );
    });
  });

  describe("headPrefix", () => {
    it("should produce prefix for scanning all heads of a document", () => {
      expect(headPrefix("doc-1")).toBe("_meta/head/doc-1/");
    });
  });

  describe("parseOperationKey", () => {
    it("should round-trip with operationKey", () => {
      const key = operationKey("doc-123", "global", "main", 7);
      const parsed = parseOperationKey(key);
      expect(parsed.documentId).toBe("doc-123");
      expect(parsed.scope).toBe("global");
      expect(parsed.branch).toBe("main");
      expect(parsed.index).toBe(7);
    });

    it("should handle large index values", () => {
      const key = operationKey("doc-1", "local", "draft", 9999999999);
      const parsed = parseOperationKey(key);
      expect(parsed.index).toBe(9999999999);
    });
  });

  describe("ORDINAL_COUNTER_KEY", () => {
    it("should be a metadata key", () => {
      expect(ORDINAL_COUNTER_KEY).toBe("_meta/ordinal");
    });
  });
});
