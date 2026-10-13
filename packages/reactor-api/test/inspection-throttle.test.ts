import { GraphQLError } from "graphql";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_INSPECTION_THROTTLE,
  InspectionThrottle,
} from "../src/graphql/inspection/throttle.js";

function extensionsOf(error: unknown): Record<string, unknown> {
  expect(error).toBeInstanceOf(GraphQLError);
  return (error as GraphQLError).extensions;
}

function thrown(run: () => void): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("expected a throw");
}

describe("InspectionThrottle", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date", "performance"] });
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("refuses a caller past its burst until a call refills", () => {
    const throttle = new InspectionThrottle();
    for (let i = 0; i < 6; i++) throttle.charge("a");
    expect(extensionsOf(thrown(() => throttle.charge("a")))).toEqual({
      code: "TOO_MANY_REQUESTS",
      retryAfterMs: 10_000,
    });
    vi.advanceTimersByTime(10_000);
    throttle.charge("a");
    expect(() => throttle.charge("a")).toThrow(GraphQLError);
  });

  it("admits a caller that waits exactly retryAfterMs", () => {
    const throttle = new InspectionThrottle({ callsPerMinute: 5 });
    for (let i = 0; i < 5; i++) throttle.charge("a");
    vi.advanceTimersByTime(3);
    const { retryAfterMs } = extensionsOf(thrown(() => throttle.charge("a")));
    vi.advanceTimersByTime(retryAfterMs as number);
    expect(() => throttle.charge("a")).not.toThrow();
  });

  it("does not drain buckets when the wall clock steps back", () => {
    const throttle = new InspectionThrottle({ callsPerMinute: 1 });
    throttle.charge("a");
    vi.setSystemTime(-1_000_000);
    vi.advanceTimersByTime(60_000);
    expect(() => throttle.charge("a")).not.toThrow();
  });

  it("keeps one bucket per caller", () => {
    const throttle = new InspectionThrottle({ callsPerMinute: 1 });
    throttle.charge("a");
    expect(() => throttle.charge("a")).toThrow(GraphQLError);
    expect(() => throttle.charge("b")).not.toThrow();
  });

  it.each([0, 0.5, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects callsPerMinute %s",
    (callsPerMinute) => {
      expect(() => new InspectionThrottle({ callsPerMinute })).toThrow(
        /callsPerMinute/,
      );
    },
  );

  it("uses the default when callsPerMinute is left out", () => {
    for (const config of [{}, { callsPerMinute: undefined }]) {
      const throttle = new InspectionThrottle(config);
      const { callsPerMinute } = DEFAULT_INSPECTION_THROTTLE;
      for (let i = 0; i < callsPerMinute; i++) throttle.charge("a");
      expect(() => throttle.charge("a")).toThrow(GraphQLError);
    }
  });

  it("tracks at most 10,000 callers, evicting the least recently seen", () => {
    const throttle = new InspectionThrottle({ callsPerMinute: 1 });
    throttle.charge("hot");
    for (let i = 0; i < 9_999; i++) throttle.charge(`old-${i}`);
    expect(throttle.trackedCallers).toBe(10_000);

    expect(() => throttle.charge("hot")).toThrow(GraphQLError);
    throttle.charge("new");
    expect(throttle.trackedCallers).toBe(10_000);
    expect(() => throttle.charge("hot")).toThrow(GraphQLError);
    throttle.charge("old-0");
  });
});
