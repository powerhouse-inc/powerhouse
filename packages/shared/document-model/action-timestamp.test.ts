import { afterEach, describe, expect, it, vi } from "vitest";
import { createAction } from "./actions.js";

describe("createAction timestamps", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("never repeats a millisecond on a frozen clock", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const stamps = [1, 2, 3].map(() => createAction("A").timestampUtcMs);
    expect(stamps).toEqual([
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.001Z",
      "2026-01-01T00:00:00.002Z",
    ]);
  });

  it("does not repeat a stamp it ran ahead to when the clock catches up", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-01T00:00:00.000Z"));
    createAction("A");
    createAction("A");
    vi.setSystemTime(new Date("2026-02-01T00:00:00.001Z"));
    expect(createAction("A").timestampUtcMs).toBe("2026-02-01T00:00:00.002Z");
  });

  it("follows a clock that steps back", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T00:00:10.000Z"));
    createAction("A");
    vi.setSystemTime(new Date("2026-03-01T00:00:00.000Z"));
    expect(createAction("A").timestampUtcMs).toBe("2026-03-01T00:00:00.000Z");
  });
});
