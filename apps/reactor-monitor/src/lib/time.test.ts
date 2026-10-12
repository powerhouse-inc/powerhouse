import { describe, expect, it } from "vitest";
import { timeSince } from "./time.js";

describe("timeSince", () => {
  const NOW = 1_000_000_000;

  it("renders 0 as never", () => {
    expect(timeSince(0, NOW)).toBe("never");
  });

  it("renders seconds", () => {
    expect(timeSince(NOW - 5_000, NOW)).toBe("5s ago");
  });

  it("renders minutes", () => {
    expect(timeSince(NOW - 2 * 60_000, NOW)).toBe("2m ago");
  });

  it("renders hours", () => {
    expect(timeSince(NOW - 3 * 60 * 60_000, NOW)).toBe("3h ago");
  });

  it("renders days", () => {
    expect(timeSince(NOW - 2 * 24 * 60 * 60_000, NOW)).toBe("2d ago");
  });

  it("clamps a future timestamp to 0s rather than going negative", () => {
    expect(timeSince(NOW + 10_000, NOW)).toBe("0s ago");
  });
});
