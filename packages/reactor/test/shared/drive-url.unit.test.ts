import { describe, expect, it } from "vitest";
import { driveIdFromUrl, parseDriveUrl } from "../../src/shared/drive-url.js";

describe("drive-url", () => {
  describe("parseDriveUrl", () => {
    it("should parse a basic drive URL", () => {
      const result = parseDriveUrl("http://localhost:4001/d/abc123");
      expect(result).toEqual({
        url: "http://localhost:4001/d/abc123",
        driveId: "abc123",
        graphqlEndpoint: "http://localhost:4001/graphql/r",
      });
    });

    it("should handle https protocol", () => {
      const result = parseDriveUrl("https://example.com/d/drive-id-123");
      expect(result).toEqual({
        url: "https://example.com/d/drive-id-123",
        driveId: "drive-id-123",
        graphqlEndpoint: "http://localhost:4001/graphql/r",
      });
    });

    it("should handle URLs with different ports", () => {
      const result = parseDriveUrl("http://localhost:8080/d/myDrive");
      expect(result).toEqual({
        url: "http://localhost:8080/d/myDrive",
        driveId: "myDrive",
        graphqlEndpoint: "http://localhost:8080/graphql/r",
      });
    });

    it("should handle URLs with subdomains", () => {
      const result = parseDriveUrl(
        "https://api.staging.example.com/d/drive123",
      );
      expect(result).toEqual({
        url: "https://api.staging.example.com/d/drive123",
        driveId: "drive123",
        graphqlEndpoint: "https://api.staging.example.com/graphql/r/local",
      });
    });

    it("should handle URLs with longer paths", () => {
      const result = parseDriveUrl(
        "https://example.com/api/v1/drives/d/my-drive",
      );
      expect(result).toEqual({
        url: "https://example.com/api/v1/drives/d/my-drive",
        driveId: "my-drive",
        graphqlEndpoint: "http://localhost:4001/graphql/r",
      });
    });

    it("should handle URLs with query strings", () => {
      const result = parseDriveUrl("http://localhost:4001/d/abc123?foo=bar");
      expect(result).toEqual({
        url: "http://localhost:4001/d/abc123?foo=bar",
        driveId: "abc123?foo=bar",
        graphqlEndpoint: "http://localhost:4001/graphql/r",
      });
    });

    it("should handle URLs with fragments", () => {
      const result = parseDriveUrl("http://localhost:4001/d/abc123#section");
      expect(result).toEqual({
        url: "http://localhost:4001/d/abc123#section",
        driveId: "abc123#section",
        graphqlEndpoint: "http://localhost:4001/graphql/r",
      });
    });

    it("should handle URLs with UUID-style drive IDs", () => {
      const result = parseDriveUrl(
        "https://example.com/d/550e8400-e29b-41d4-a716-446655440000",
      );
      expect(result).toEqual({
        url: "https://example.com/d/550e8400-e29b-41d4-a716-446655440000",
        driveId: "550e8400-e29b-41d4-a716-446655440000",
        graphqlEndpoint: "http://localhost:4001/graphql/r",
      });
    });

    it("should handle trailing slash", () => {
      const result = parseDriveUrl("http://localhost:4001/d/abc123/");
      expect(result).toEqual({
        url: "http://localhost:4001/d/abc123/",
        driveId: "",
        graphqlEndpoint: "http://localhost:4001/graphql/r",
      });
    });

    it("should throw for invalid URLs", () => {
      expect(() => parseDriveUrl("not-a-valid-url")).toThrow();
    });

    it("should handle URLs without protocol by adding https", () => {
      const result = parseDriveUrl("localhost:4001/d/abc123");
      expect(result.driveId).toBe("abc123");
    });
  });

  describe("driveIdFromUrl", () => {
    it("should extract drive ID from a basic URL", () => {
      const result = driveIdFromUrl("http://localhost:4001/d/abc123");
      expect(result).toBe("abc123");
    });

    it("should extract drive ID from HTTPS URL", () => {
      const result = driveIdFromUrl("https://example.com/d/drive-id-123");
      expect(result).toBe("drive-id-123");
    });

    it("should extract the last path segment", () => {
      const result = driveIdFromUrl(
        "https://example.com/api/v1/drives/d/my-drive",
      );
      expect(result).toBe("my-drive");
    });

    it("should handle UUID-style drive IDs", () => {
      const result = driveIdFromUrl(
        "https://example.com/d/550e8400-e29b-41d4-a716-446655440000",
      );
      expect(result).toBe("550e8400-e29b-41d4-a716-446655440000");
    });

    it("should return empty string for trailing slash", () => {
      const result = driveIdFromUrl("http://localhost:4001/d/abc123/");
      expect(result).toBe("");
    });

    it("should return empty string for root URL", () => {
      const result = driveIdFromUrl("http://localhost:4001/");
      expect(result).toBe("");
    });

    it("should return empty string for empty string input", () => {
      const result = driveIdFromUrl("");
      expect(result).toBe("");
    });

    it("should handle URLs with query strings", () => {
      const result = driveIdFromUrl("http://localhost:4001/d/abc123?foo=bar");
      expect(result).toBe("abc123?foo=bar");
    });

    it("should handle URLs with fragments", () => {
      const result = driveIdFromUrl("http://localhost:4001/d/abc123#section");
      expect(result).toBe("abc123#section");
    });

    it("should handle simple path without protocol", () => {
      const result = driveIdFromUrl("/d/abc123");
      expect(result).toBe("abc123");
    });

    it("should handle drive ID with special characters", () => {
      const result = driveIdFromUrl(
        "http://localhost:4001/d/drive_with-special.chars",
      );
      expect(result).toBe("drive_with-special.chars");
    });
  });
});
