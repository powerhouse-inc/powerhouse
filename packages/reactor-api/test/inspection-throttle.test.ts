import { GraphQLError } from "graphql";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InspectionThrottle } from "../src/graphql/inspection/throttle.js";

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
    vi.useFakeTimers({ toFake: ["Date"] });
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
    vi.setSystemTime(10_000);
    throttle.charge("a");
    expect(() => throttle.charge("a")).toThrow(GraphQLError);
  });

  it("keeps one bucket per caller", () => {
    const throttle = new InspectionThrottle({ callsPerMinute: 1 });
    throttle.charge("a");
    expect(() => throttle.charge("a")).toThrow(GraphQLError);
    expect(() => throttle.charge("b")).not.toThrow();
  });

  it("prunes refilled buckets once it tracks too many callers", () => {
    const throttle = new InspectionThrottle();
    for (let i = 0; i < 10_000; i++) throttle.charge(`old-${i}`);
    for (let i = 0; i < 6; i++) throttle.charge("hot");
    expect(throttle.trackedCallers).toBe(10_001);

    vi.setSystemTime(10_000);
    throttle.charge("new");
    expect(throttle.trackedCallers).toBe(2);
    throttle.charge("hot");
    expect(() => throttle.charge("hot")).toThrow(GraphQLError);
  });
});
