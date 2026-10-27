import { afterEach, describe, expect, it, vi } from "vitest";
import { createAction } from "./actions.js";

const auth = () => createAction("A", undefined, undefined, undefined, "auth");

describe("createAction timestamps", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("never repeats a millisecond for auth actions on a frozen clock", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const stamps = [1, 2, 3].map(() => auth().timestampUtcMs);
    expect(stamps).toEqual([
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.001Z",
      "2026-01-01T00:00:00.002Z",
    ]);
  });

  it("does not repeat an auth stamp it ran ahead to when the clock catches up", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-01T00:00:00.000Z"));
    auth();
    auth();
    vi.setSystemTime(new Date("2026-02-01T00:00:00.001Z"));
    expect(auth().timestampUtcMs).toBe("2026-02-01T00:00:00.002Z");
  });

  it("follows a clock that steps back for auth actions", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T00:00:10.000Z"));
    auth();
    vi.setSystemTime(new Date("2026-03-01T00:00:00.000Z"));
    expect(auth().timestampUtcMs).toBe("2026-03-01T00:00:00.000Z");
  });

  it("stamps every other scope with the wall clock", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-01T00:00:00.000Z"));
    auth();
    auth();
    const stamps = ["global", "local", "document", "global"].map(
      (scope) =>
        createAction("A", undefined, undefined, undefined, scope)
          .timestampUtcMs,
    );
    expect(new Set(stamps)).toEqual(new Set(["2026-04-01T00:00:00.000Z"]));
  });
});
