import { describe, expect, expectTypeOf, it } from "vitest";
import { latestVersionOf } from "./upgrades.js";

describe("latestVersionOf", () => {
  it("returns the last supported version, typed as that literal", () => {
    const latest = latestVersionOf([1, 2, 3] as const);
    expect(latest).toBe(3);
    expectTypeOf(latest).toEqualTypeOf<3>();
  });

  it("returns the only version of a one-version model", () => {
    const latest = latestVersionOf([1] as const);
    expect(latest).toBe(1);
    expectTypeOf(latest).toEqualTypeOf<1>();
  });

  it("falls back to number for a non-literal tuple", () => {
    const versions: [number, ...number[]] = [4, 7];
    expect(latestVersionOf(versions)).toBe(7);
    expectTypeOf(latestVersionOf(versions)).toEqualTypeOf<number>();
  });
});
