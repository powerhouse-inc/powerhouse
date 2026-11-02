import { describe, expect, it } from "vitest";
import {
  InvalidNamespaceError,
  resolvePackageName,
} from "../../src/http/namespace.js";

describe("resolvePackageName", () => {
  const named = () => "@acme/project";

  it("takes a package name as it is, without a version", () => {
    expect(resolvePackageName("@acme/project", named)).toBe("@acme/project");
    expect(resolvePackageName("@acme/project@1.3.9", named)).toBe(
      "@acme/project",
    );
  });

  it.each([
    ["a POSIX path", "/Users/me/project"],
    ["a relative path", "./project"],
    ["a Windows path", "D:\\projects\\project"],
    ["a Windows path with forward slashes", "D:/projects/project"],
  ])("reads the name of the package at %s", (_label, key) => {
    expect(resolvePackageName(key, named)).toBe("@acme/project");
  });

  it("refuses a path whose package has no usable name", () => {
    expect(() => resolvePackageName("D:\\project", () => undefined)).toThrow(
      InvalidNamespaceError,
    );
  });

  it("refuses what is neither a name nor a path", () => {
    expect(() => resolvePackageName("not a name", named)).toThrow(
      InvalidNamespaceError,
    );
  });
});
