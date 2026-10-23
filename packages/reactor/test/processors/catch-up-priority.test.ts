import { describe, expect, it, vi } from "vitest";
import {
  CATCH_UP_LEVELS,
  CatchUpPriority,
  DynamicPriorityController,
  parseCatchUpPriority,
  type CatchUpLoadSample,
} from "../../src/processors/catch-up-priority.js";

const busy: CatchUpLoadSample = {
  requests: 20,
  p95LatencyMs: 40,
  eventLoopDelayMs: 10,
  idleForMs: 0,
};
const idle: CatchUpLoadSample = {
  requests: 0,
  p95LatencyMs: 0,
  eventLoopDelayMs: 10,
  idleForMs: 14_200,
};

function ticks(
  controller: DynamicPriorityController,
  sample: CatchUpLoadSample,
  count: number,
): number[] {
  return Array.from({ length: count }, () => controller.tick(sample).level);
}

describe("CATCH_UP_LEVELS", () => {
  it("matches the design's table", () => {
    expect(
      CATCH_UP_LEVELS.map((l) => [l.slots, l.pageSize, l.pauseMs, l.giveWay]),
    ).toEqual([
      [0, 0, 0, "stop"],
      [1, 100, 50, "pause"],
      [1, 250, 20, "pause"],
      [2, 250, 10, "pause"],
      [3, 500, 0, "yield"],
      [4, 500, 0, "yield"],
      [6, 1000, 0, "yield"],
      [8, 2000, 0, "none"],
    ]);
  });
});

describe("DynamicPriorityController", () => {
  it("starts at 4", () => {
    expect(new DynamicPriorityController().level).toBe(4);
  });

  it("drops 2 levels on latency pressure, never below 1", () => {
    const controller = new DynamicPriorityController();
    const pressure = { ...busy, p95LatencyMs: 412 };
    expect(controller.tick(pressure)).toEqual({
      level: 2,
      reason: "pressure: p95 412 ms",
    });
    expect(ticks(controller, pressure, 2)).toEqual([1, 1]);
  });

  it("drops on event-loop delay pressure even without requests", () => {
    const controller = new DynamicPriorityController();
    expect(controller.tick({ ...idle, eventLoopDelayMs: 130.4 })).toEqual({
      level: 2,
      reason: "pressure: loop delay 130 ms",
    });
  });

  it("treats the thresholds as exclusive", () => {
    const controller = new DynamicPriorityController();
    expect(
      controller.tick({ ...busy, p95LatencyMs: 250, eventLoopDelayMs: 100 }),
    ).toEqual({ level: 4, reason: "holding" });
  });

  it("rises 1 after 5 calm busy ticks, up to 5", () => {
    const controller = new DynamicPriorityController();
    expect(ticks(controller, busy, 5)).toEqual([4, 4, 4, 4, 5]);
    expect(ticks(controller, busy, 10)).toEqual(Array(10).fill(5));
    expect(controller.tick(busy).reason).toBe("busy, healthy");
  });

  it("needs the calm ticks in a row", () => {
    const controller = new DynamicPriorityController();
    ticks(controller, busy, 4);
    expect(controller.tick({ ...busy, p95LatencyMs: 200 }).reason).toBe(
      "holding",
    );
    expect(ticks(controller, busy, 5)).toEqual([4, 4, 4, 4, 5]);
  });

  it("resets the calm count on pressure", () => {
    const controller = new DynamicPriorityController();
    ticks(controller, busy, 4);
    controller.tick({ ...busy, eventLoopDelayMs: 150 });
    expect(ticks(controller, busy, 5)).toEqual([2, 2, 2, 2, 3]);
  });

  it("rises 1 every 2 idle ticks, up to 6", () => {
    const controller = new DynamicPriorityController();
    expect(ticks(controller, idle, 6)).toEqual([4, 5, 5, 6, 6, 6]);
    expect(controller.tick(idle).reason).toBe("idle 14 s");
  });

  it("does not count as idle before 10 s without requests", () => {
    const controller = new DynamicPriorityController();
    const quiet = { ...idle, idleForMs: 9_999 };
    expect(ticks(controller, quiet, 4)).toEqual([4, 4, 4, 4]);
    expect(controller.tick(quiet).reason).toBe("holding");
  });

  it("holds at 6 when requests return healthy", () => {
    const controller = new DynamicPriorityController(6);
    expect(ticks(controller, busy, 6)).toEqual(Array(6).fill(6));
  });

  it("clamps its start to 1-6", () => {
    expect(new DynamicPriorityController(0).level).toBe(1);
    expect(new DynamicPriorityController(7).level).toBe(6);
  });
});

describe("parseCatchUpPriority", () => {
  it("reads dynamic, empty and levels 0-7", () => {
    expect(parseCatchUpPriority(undefined)).toEqual({ mode: "dynamic" });
    expect(parseCatchUpPriority("")).toEqual({ mode: "dynamic" });
    expect(parseCatchUpPriority(" Dynamic ")).toEqual({ mode: "dynamic" });
    expect(parseCatchUpPriority("0")).toEqual({ mode: "fixed", level: 0 });
    expect(parseCatchUpPriority("7")).toEqual({ mode: "fixed", level: 7 });
  });

  it("refuses anything else", () => {
    for (const value of ["8", "-1", "1.5", "fast", "07"]) {
      expect(parseCatchUpPriority(value)).toBeUndefined();
    }
  });
});

describe("CatchUpPriority", () => {
  it("defaults to dynamic at 4, holding without a load source", () => {
    const priority = new CatchUpPriority();
    priority.tick();
    expect(priority.get()).toEqual({
      mode: "dynamic",
      level: 4,
      settings: CATCH_UP_LEVELS[4],
      reason: "no load signal",
      sample: undefined,
    });
    expect(priority.slots.size).toBe(3);
  });

  it("ticks the controller from its load source", () => {
    const sample = { ...busy, p95LatencyMs: 300 };
    const priority = new CatchUpPriority(
      { mode: "dynamic" },
      { sample: () => sample },
    );
    priority.tick();
    expect(priority.get()).toMatchObject({
      level: 2,
      reason: "pressure: p95 300 ms",
      sample,
    });
    expect(priority.slots.size).toBe(1);
  });

  it("ignores ticks while fixed, and resizes its slots with the level", () => {
    const sample = vi.fn(() => busy);
    const priority = new CatchUpPriority(
      { mode: "fixed", level: 7 },
      { sample },
    );
    priority.tick();
    expect(sample).not.toHaveBeenCalled();
    expect(priority.get()).toMatchObject({
      mode: "fixed",
      level: 7,
      reason: "fixed",
    });
    expect(priority.slots.size).toBe(8);

    priority.set({ mode: "fixed", level: 0 });
    expect(priority.slots.size).toBe(0);
    expect(priority.pageSize()).toBe(100);
  });

  it("restarts the controller at 4 when set back to dynamic", () => {
    const priority = new CatchUpPriority(
      { mode: "fixed", level: 1 },
      { sample: () => idle },
    );
    priority.set({ mode: "dynamic" });
    expect(priority.get()).toMatchObject({
      mode: "dynamic",
      level: 4,
      reason: "starting",
    });
  });

  it("refuses an invalid setting", () => {
    const priority = new CatchUpPriority();
    expect(() => priority.set({ mode: "fixed", level: 8 })).toThrow(
      "integer from 0 to 7",
    );
    expect(() =>
      priority.set({ mode: "turbo" } as unknown as { mode: "dynamic" }),
    ).toThrow('"fixed" or "dynamic"');
    expect(() => new CatchUpPriority({ mode: "fixed", level: 2.5 })).toThrow();
  });

  it("tells subscribers about every change until they unsubscribe", () => {
    const priority = new CatchUpPriority();
    const seen: number[] = [];
    const stop = priority.subscribe((state) => seen.push(state.level));
    priority.set({ mode: "fixed", level: 2 });
    stop();
    priority.set({ mode: "fixed", level: 3 });
    expect(seen).toEqual([2]);
  });

  it("waits between pages at level 0 until the level rises", async () => {
    const priority = new CatchUpPriority({ mode: "fixed", level: 0 });
    let passed = false;
    const waiting = priority.betweenPages().then(() => (passed = true));
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(passed).toBe(false);

    priority.set({ mode: "fixed", level: 7 });
    await waiting;
    expect(passed).toBe(true);
  });

  it("ends a level-0 wait when cancelled", async () => {
    const priority = new CatchUpPriority({ mode: "fixed", level: 0 });
    await priority.betweenPages(Promise.resolve());
  });

  it("ticks on a timer until stopped", () => {
    vi.useFakeTimers();
    try {
      const sample = vi.fn(() => busy);
      const priority = new CatchUpPriority({ mode: "dynamic" }, { sample });
      const stop = priority.startTicking();
      vi.advanceTimersByTime(3_000);
      stop();
      vi.advanceTimersByTime(3_000);
      expect(sample).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
