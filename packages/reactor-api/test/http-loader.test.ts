import { describe, expect, it } from "vitest";
import { HttpPackageLoader } from "../src/packages/http-loader.js";

describe("HttpPackageLoader", () => {
  describe("constructor", () => {
    it("should normalize registry URL with trailing slash", () => {
      const loader = new HttpPackageLoader({
        registryUrl: "http://localhost:8080",
      });
      // Access private property for testing
      expect((loader as any).registryUrl).toBe("http://localhost:8080/");
    });

    it("should keep trailing slash if already present", () => {
      const loader = new HttpPackageLoader({
        registryUrl: "http://localhost:8080/",
      });
      expect((loader as any).registryUrl).toBe("http://localhost:8080/");
    });
  });

  describe("isValidPackageName", () => {
    const loader = new HttpPackageLoader({
      registryUrl: "http://localhost:8080",
    });

    // Access private method for testing
    const isValid = (name: string) => (loader as any).isValidPackageName(name);

    it("should accept valid unscoped package names", () => {
      expect(isValid("my-package")).toBe(true);
      expect(isValid("package123")).toBe(true);
      expect(isValid("my_package")).toBe(true);
      expect(isValid("my.package")).toBe(true);
    });

    it("should accept valid scoped package names", () => {
      expect(isValid("@scope/package")).toBe(true);
      expect(isValid("@my-org/my-package")).toBe(true);
      expect(isValid("@powerhousedao/vetra")).toBe(true);
    });

    it("should reject invalid package names", () => {
      expect(isValid("")).toBe(false);
      expect(isValid("../escape")).toBe(false);
      expect(isValid("path/..")).toBe(false);
    });

    it("should accept uppercase package names (case-insensitive)", () => {
      // The regex is case-insensitive to handle mixed-case package names
      expect(isValid("UPPERCASE")).toBe(true);
      expect(isValid("MyPackage")).toBe(true);
    });

    it("should reject package names that are too long", () => {
      const longName = "a".repeat(215);
      expect(isValid(longName)).toBe(false);
    });
  });

  describe("loadDocumentModels", () => {
    it("should throw error for invalid package name", async () => {
      const loader = new HttpPackageLoader({
        registryUrl: "http://localhost:8080",
      });

      await expect(loader.loadDocumentModels("../escape")).rejects.toThrow(
        "Invalid package name",
      );
    });

    it("should throw error when package cannot be loaded", async () => {
      const loader = new HttpPackageLoader({
        registryUrl: "http://localhost:9999", // non-existent server
      });

      await expect(loader.loadDocumentModels("some-package")).rejects.toThrow(
        "Failed to load document models",
      );
    });
  });

  describe("loadPackages", () => {
    it("should skip empty package names", async () => {
      const loader = new HttpPackageLoader({
        registryUrl: "http://localhost:9999",
      });

      const logs: string[] = [];
      const models = await loader.loadPackages(["", "  ", "   "], {
        info: (msg) => logs.push(msg),
        error: (msg) => logs.push(msg),
      });

      expect(models).toEqual([]);
      expect(logs).toHaveLength(0);
    });

    it("should continue loading even if some packages fail", async () => {
      const loader = new HttpPackageLoader({
        registryUrl: "http://localhost:9999",
      });

      const errors: string[] = [];
      const models = await loader.loadPackages(["pkg1", "pkg2"], {
        info: () => {},
        error: (msg) => errors.push(msg),
      });

      // Both should fail since server doesn't exist
      expect(models).toEqual([]);
      expect(errors).toHaveLength(2);
      expect(errors[0]).toContain("pkg1");
      expect(errors[1]).toContain("pkg2");
    });
  });
});
