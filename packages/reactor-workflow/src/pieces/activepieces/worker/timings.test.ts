import { afterEach, describe, expect, it, vi } from "vitest";
import {
  startRequestTimings,
  timed,
  wallClock,
  withRequestTimings,
} from "./timings.js";

describe("request timings", () => {
  it("records the phase a nested one ran inside", async () => {
    const timings = startRequestTimings();
    await withRequestTimings(timings, () =>
      timed("action", () => timed("models", () => Promise.resolve())),
    );

    expect(
      timings.phases.map(({ name, parent }) => ({ name, parent })),
    ).toEqual([
      { name: "models", parent: "action" },
      { name: "action", parent: undefined },
    ]);
  });

  it("records nothing outside a request", async () => {
    const timings = startRequestTimings();
    await timed("action", () => Promise.resolve());

    expect(timings.phases).toEqual([]);
  });
});

describe("the wall clock", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("never steps back for the wall clock's ms rounding", () => {
    vi.useFakeTimers({ toFake: ["Date", "performance"] });
    const clock = wallClock();
    const before = clock();
    // Date.now() reads up to a ms behind the sub-ms clock at the re-anchor.
    vi.advanceTimersByTime(1_000);
    vi.setSystemTime(Date.now() - 1);

    expect(clock()).toBeGreaterThanOrEqual(before + 1_000);
  });

  it("follows a clock step within a second", () => {
    vi.useFakeTimers({ toFake: ["Date", "performance"] });
    const clock = wallClock();
    expect(Math.abs(clock() - Date.now())).toBeLessThan(5);

    vi.setSystemTime(Date.now() + 300_000);
    // Until it re-anchors it keeps the old origin.
    expect(Date.now() - clock()).toBeGreaterThan(299_000);
    vi.advanceTimersByTime(1_000);
    expect(Math.abs(clock() - Date.now())).toBeLessThan(5);
  });
});
