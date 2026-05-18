import { describe, expect, it } from "vitest";
import { resolveCollision } from "../src/processors/utils/collisions.js";

describe("resolveCollision", () => {
  it("returns the requested name when no sibling has it", () => {
    expect(resolveCollision("foo", [])).toBe("foo");
    expect(resolveCollision("foo", ["bar"])).toBe("foo");
  });

  it("appends (2) on first collision", () => {
    expect(resolveCollision("foo", ["foo"])).toBe("foo (2)");
  });

  it("walks suffixes deterministically", () => {
    expect(resolveCollision("foo", ["foo", "foo (2)"])).toBe("foo (3)");
    expect(resolveCollision("foo", ["foo", "foo (2)", "foo (3)"])).toBe(
      "foo (4)",
    );
  });

  it("ignores gaps when picking the next suffix", () => {
    expect(resolveCollision("foo", ["foo", "foo (3)"])).toBe("foo (2)");
  });

  it("treats sibling names independently from the requested name", () => {
    expect(resolveCollision("bar", ["foo", "foo (2)"])).toBe("bar");
  });
});
