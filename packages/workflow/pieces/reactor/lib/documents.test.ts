import { afterEach, describe, expect, it, vi } from "vitest";
import { plainAction } from "./documents.js";

describe("plainAction", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("stamps auth actions built in one millisecond strictly increasing", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-01T00:00:00.000Z"));
    const stamps = [1, 2, 3].map(
      () => plainAction("SET_GRANT", {}, "auth").timestampUtcMs,
    );
    expect(stamps).toEqual([
      "2026-04-01T00:00:00.000Z",
      "2026-04-01T00:00:00.001Z",
      "2026-04-01T00:00:00.002Z",
    ]);
  });

  it("stamps every other scope with the wall clock", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T00:00:00.000Z"));
    plainAction("SET_GRANT", {}, "auth");
    plainAction("SET_GRANT", {}, "auth");
    for (const scope of ["global", "local", "document"]) {
      expect(plainAction("SET_NAME", {}, scope).timestampUtcMs).toBe(
        "2026-05-01T00:00:00.000Z",
      );
    }
  });
});
