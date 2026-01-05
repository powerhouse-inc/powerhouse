import { describe, expect, it } from "vitest";
import {
  decodeDocumentIdFromPath,
  encodeDocumentIdForPath,
  hasBase64SpecialChars,
  isUUID,
} from "../src/storage/path-encoding.js";

describe("path-encoding", () => {
  describe("isUUID", () => {
    it("should return true for valid UUIDs", () => {
      expect(isUUID("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
      expect(isUUID("6ba7b810-9dad-41d4-80b4-00c04fd430c8")).toBe(true);
    });

    it("should return false for non-UUIDs", () => {
      expect(isUUID("not-a-uuid")).toBe(false);
      expect(isUUID("ABC123")).toBe(false);
      expect(
        isUUID(
          "A3FpKZim2BmoIoDfY4mxdLvP2j8dMaj6kzDiqjMRVpdyL8hmr0HgRaI4rS+Y3X/rM/61jUCGetiTeI4edXC7oQ==",
        ),
      ).toBe(false);
    });
  });

  describe("hasBase64SpecialChars", () => {
    it("should return true for strings with +, /, or =", () => {
      expect(hasBase64SpecialChars("abc+def")).toBe(true);
      expect(hasBase64SpecialChars("abc/def")).toBe(true);
      expect(hasBase64SpecialChars("abc==")).toBe(true);
      expect(hasBase64SpecialChars("a+b/c=")).toBe(true);
    });

    it("should return false for strings without special chars", () => {
      expect(hasBase64SpecialChars("abcdef")).toBe(false);
      expect(hasBase64SpecialChars("abc-def")).toBe(false);
      expect(hasBase64SpecialChars("abc_def")).toBe(false);
    });
  });

  describe("encodeDocumentIdForPath", () => {
    it("should pass through UUIDs unchanged", () => {
      const uuid = "550e8400-e29b-41d4-a716-446655440000";
      expect(encodeDocumentIdForPath(uuid)).toBe(uuid);
    });

    it("should encode Base64 signatures to Base64url", () => {
      const base64 =
        "A3FpKZim2BmoIoDfY4mxdLvP2j8dMaj6kzDiqjMRVpdyL8hmr0HgRaI4rS+Y3X/rM/61jUCGetiTeI4edXC7oQ==";
      const expected =
        "A3FpKZim2BmoIoDfY4mxdLvP2j8dMaj6kzDiqjMRVpdyL8hmr0HgRaI4rS-Y3X_rM_61jUCGetiTeI4edXC7oQ";
      expect(encodeDocumentIdForPath(base64)).toBe(expected);
    });

    it("should handle Base64 with only + characters", () => {
      const base64 = "abc+def+ghi";
      expect(encodeDocumentIdForPath(base64)).toBe("abc-def-ghi");
    });

    it("should handle Base64 with only / characters", () => {
      const base64 = "abc/def/ghi";
      expect(encodeDocumentIdForPath(base64)).toBe("abc_def_ghi");
    });

    it("should handle Base64 with only = padding", () => {
      const base64 = "abcdef==";
      expect(encodeDocumentIdForPath(base64)).toBe("abcdef");
    });

    it("should pass through alphanumeric-only strings", () => {
      const id = "ABCDEFghij123";
      expect(encodeDocumentIdForPath(id)).toBe(id);
    });
  });

  describe("decodeDocumentIdFromPath", () => {
    it("should pass through UUIDs unchanged", () => {
      const uuid = "550e8400-e29b-41d4-a716-446655440000";
      expect(decodeDocumentIdFromPath(uuid)).toBe(uuid);
    });

    it("should decode Base64url back to Base64", () => {
      const base64url =
        "A3FpKZim2BmoIoDfY4mxdLvP2j8dMaj6kzDiqjMRVpdyL8hmr0HgRaI4rS-Y3X_rM_61jUCGetiTeI4edXC7oQ";
      const expected =
        "A3FpKZim2BmoIoDfY4mxdLvP2j8dMaj6kzDiqjMRVpdyL8hmr0HgRaI4rS+Y3X/rM/61jUCGetiTeI4edXC7oQ==";
      expect(decodeDocumentIdFromPath(base64url)).toBe(expected);
    });

    it("should restore padding correctly", () => {
      // 86 chars -> 86 % 4 = 2 -> add 2 = padding
      const encoded =
        "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnopqrstuvwx";
      const decoded = decodeDocumentIdFromPath(encoded);
      expect(decoded.endsWith("==")).toBe(true);
    });
  });

  describe("bijection property", () => {
    it("should be a proper bijection for Base64 signatures", () => {
      const original =
        "A3FpKZim2BmoIoDfY4mxdLvP2j8dMaj6kzDiqjMRVpdyL8hmr0HgRaI4rS+Y3X/rM/61jUCGetiTeI4edXC7oQ==";
      const encoded = encodeDocumentIdForPath(original);
      const decoded = decodeDocumentIdFromPath(encoded);
      expect(decoded).toBe(original);
    });

    it("should be a proper bijection for UUIDs", () => {
      const original = "550e8400-e29b-41d4-a716-446655440000";
      const encoded = encodeDocumentIdForPath(original);
      const decoded = decodeDocumentIdFromPath(encoded);
      expect(decoded).toBe(original);
    });

    it("should be deterministic", () => {
      const original = "test+value/with=padding==";
      const encoded1 = encodeDocumentIdForPath(original);
      const encoded2 = encodeDocumentIdForPath(original);
      expect(encoded1).toBe(encoded2);
    });

    it("should handle Base64 with only + (no /)", () => {
      const original = "abc+def+ghi==";
      const encoded = encodeDocumentIdForPath(original);
      expect(encoded).toBe("abc-def-ghi");
      const decoded = decodeDocumentIdFromPath(encoded);
      // Note: decoded will have + restored and padding added
      expect(decoded).toBe("abc+def+ghi=");
    });
  });

  describe("edge cases", () => {
    it("should handle empty string", () => {
      expect(encodeDocumentIdForPath("")).toBe("");
      expect(decodeDocumentIdFromPath("")).toBe("");
    });

    it("should handle string with no padding originally", () => {
      // A Base64 string that happens to be a multiple of 4
      const original = "abcd";
      const encoded = encodeDocumentIdForPath(original);
      expect(encoded).toBe("abcd");
      const decoded = decodeDocumentIdFromPath(encoded);
      // Since it's not a UUID and length % 4 = 0, no padding added
      expect(decoded).toBe("abcd");
    });
  });
});
