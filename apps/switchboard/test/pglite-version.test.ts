import { describe, expect, it } from "vitest";
import { parseForcePgVersion } from "../src/pglite-version.js";

describe("parseForcePgVersion", () => {
  it("returns null for undefined", () => {
    expect(parseForcePgVersion(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseForcePgVersion("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(parseForcePgVersion("   ")).toBeNull();
  });

  it("returns 16 for '16'", () => {
    expect(parseForcePgVersion("16")).toBe(16);
  });

  it("returns 17 for '17'", () => {
    expect(parseForcePgVersion("17")).toBe(17);
  });

  it("throws for unsupported major", () => {
    expect(() => parseForcePgVersion("15")).toThrow(/PH_FORCE_PG_VERSION/);
    expect(() => parseForcePgVersion("15")).toThrow(/got: 15/);
  });

  it("throws for non-numeric", () => {
    expect(() => parseForcePgVersion("foo")).toThrow(/PH_FORCE_PG_VERSION/);
  });

  it("throws for non-integer numeric", () => {
    expect(() => parseForcePgVersion("16.5")).toThrow(/PH_FORCE_PG_VERSION/);
  });
});
