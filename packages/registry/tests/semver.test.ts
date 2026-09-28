import { describe, expect, it } from "vitest";
import { compareSemver } from "../src/semver.js";

describe("compareSemver", () => {
  it("orders prerelease counters numerically", () => {
    const versions = ["6.2.3-dev.27", "6.2.3", "6.2.3-dev.9", "6.2.2"];
    expect(versions.sort(compareSemver)).toEqual([
      "6.2.2",
      "6.2.3-dev.9",
      "6.2.3-dev.27",
      "6.2.3",
    ]);
  });

  it("sorts numeric identifiers first and shorter identifier lists first", () => {
    expect(compareSemver("1.0.0-1", "1.0.0-alpha")).toBeLessThan(0);
    expect(compareSemver("1.0.0-alpha", "1.0.0-alpha.1")).toBeLessThan(0);
    expect(compareSemver("1.0.0-alpha.beta", "1.0.0-beta")).toBeLessThan(0);
    expect(compareSemver("1.0.0+build.1", "1.0.0")).toBe(0);
  });
});
