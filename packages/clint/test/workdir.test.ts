import path from "node:path";
import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { resolveWorkdir } from "../src/core/workdir.js";

describe("resolveWorkdir", () => {
  it("defaults to cwd when no options", () => {
    const result = resolveWorkdir();
    expect(result).toBe(process.cwd());
  });

  it("uses fallback when provided", () => {
    const result = resolveWorkdir({ fallback: "/tmp/test" });
    expect(result).toBe(path.resolve("/tmp/test"));
  });

  it("cliFlag overrides fallback", () => {
    const result = resolveWorkdir({
      fallback: "/tmp/base",
      cliFlag: "/tmp/override",
    });
    expect(result).toBe(path.resolve("/tmp/override"));
  });

  it("implementationOverride overrides cliFlag", () => {
    const result = resolveWorkdir({
      fallback: "/tmp/base",
      cliFlag: "/tmp/flag",
      implementationOverride: "/tmp/impl",
    });
    expect(result).toBe(path.resolve("/tmp/impl"));
  });

  it("resolves relative paths against fallback", () => {
    const result = resolveWorkdir({
      fallback: "/tmp/base",
      cliFlag: "relative/path",
    });
    expect(result).toBe(resolve("/tmp/base", "relative/path"));
  });

  it("resolves relative implementation override against fallback", () => {
    const result = resolveWorkdir({
      fallback: "/tmp/base",
      implementationOverride: "./my-workspace",
    });
    expect(result).toBe(resolve("/tmp/base", "./my-workspace"));
  });
});
