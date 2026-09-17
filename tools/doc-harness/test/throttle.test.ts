import { describe, expect, it } from "vitest";
import { UtilizationThrottle } from "../src/lib/throttle.js";

/** A clock the tests move by hand, and a sleep that advances it. */
function fakeClock() {
  let t = 0;
  return {
    now: () => t,
    sleep: (ms: number) => {
      t += ms;
      return Promise.resolve();
    },
  };
}

describe("UtilizationThrottle", () => {
  it("does nothing until a reading crosses the threshold", async () => {
    const clock = fakeClock();
    const th = new UtilizationThrottle({ threshold: 0.9, ...clock });
    expect(th.shouldWait()).toBe(false);
    th.observe({ fiveHour: 0.85, sevenDay: 0.2 });
    expect(await th.wait()).toBe(0);
    th.observe({ fiveHour: 0.9, sevenDay: null });
    expect(th.shouldWait()).toBe(true);
    expect(th.last).toEqual({ fiveHour: 0.9, sevenDay: 0.2 });
  });

  it("waits until a lower reading arrives, polling at the interval", async () => {
    let t = 0;
    let polls = 0;
    const lines: string[] = [];
    const th = new UtilizationThrottle({
      threshold: 0.9,
      pollMs: 60_000,
      maxWaitMs: 15 * 60_000,
      log: (l) => lines.push(l),
      now: () => t,
      sleep: (ms) => {
        t += ms;
        polls += 1;
        // A concurrent process finishes with a lower reading on the second poll.
        if (polls === 2) th.observe({ fiveHour: 0.5, sevenDay: null });
        return Promise.resolve();
      },
    });
    th.observe({ fiveHour: 0.95, sevenDay: null });
    expect(await th.wait()).toBe(120_000);
    expect(polls).toBe(2);
    expect(th.waits).toBe(1);
    expect(lines[0]).toContain("95% >= 90%");
    expect(lines.at(-1)).toContain("resuming after 120s");
  });

  it("gives up after maxWaitMs when nothing changes", async () => {
    const clock = fakeClock();
    const th = new UtilizationThrottle({
      threshold: 0.9,
      pollMs: 60_000,
      maxWaitMs: 5 * 60_000,
      ...clock,
    });
    th.observe({ fiveHour: 0.99, sevenDay: null });
    expect(await th.wait()).toBe(5 * 60_000);
    expect(clock.now()).toBe(5 * 60_000);
  });

  it("0 disables", async () => {
    const th = new UtilizationThrottle({ threshold: 0, ...fakeClock() });
    th.observe({ fiveHour: 1, sevenDay: 1 });
    expect(th.shouldWait()).toBe(false);
    expect(await th.wait()).toBe(0);
  });

  it("ignores empty readings", () => {
    const th = new UtilizationThrottle({ threshold: 0.9, ...fakeClock() });
    th.observe({ fiveHour: 0.95, sevenDay: 0.4 });
    th.observe({ fiveHour: null, sevenDay: null });
    expect(th.last).toEqual({ fiveHour: 0.95, sevenDay: 0.4 });
  });
});
