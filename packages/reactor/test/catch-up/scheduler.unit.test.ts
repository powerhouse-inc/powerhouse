import { ConsoleLogger } from "document-model";
import { describe, expect, it, vi } from "vitest";
import type { IOperationIndex } from "../../src/cache/operation-index-types.js";
import { CatchUpScheduler } from "../../src/catch-up/scheduler.js";
import {
  defaultCatchUpConfig,
  type ICatchUpConsumer,
  type ISettledWatermark,
  type SweepResult,
} from "../../src/catch-up/types.js";

function fixedWatermark(settledThrough: number): ISettledWatermark {
  return {
    settledThrough,
    refresh: vi.fn(() => Promise.resolve(settledThrough)),
    onAdvance: () => () => {},
    status: () => ({ head: settledThrough, settledThrough, waitingOn: [] }),
  };
}

function indexOver(ordinals: number[]) {
  const getOrdinalsInRange = vi.fn(
    (after: number, through: number, limit: number) =>
      Promise.resolve(
        ordinals.filter((o) => o > after && o <= through).slice(0, limit),
      ),
  );
  return {
    index: { getOrdinalsInRange } as unknown as IOperationIndex,
    getOrdinalsInRange,
  };
}

function consumer(
  consumerId: string,
  appliedThrough: number,
  sweep?: (settled: number, present: readonly number[]) => Promise<void>,
) {
  const calls: Array<{ settled: number; present: readonly number[] }> = [];
  const value: ICatchUpConsumer = {
    consumerId,
    appliedThrough,
    trackedAbove: 0,
    sweep: async (settled, present): Promise<SweepResult> => {
      calls.push({ settled, present });
      await sweep?.(settled, present);
      return {
        consumerId,
        from: appliedThrough,
        to: settled,
        durationMs: 0,
        replayed: 0,
        reapplied: 0,
      };
    },
  };
  return { value, calls };
}

const logger = new ConsoleLogger(["test"]);

describe("CatchUpScheduler", () => {
  it("sweeps every consumer from one page read at the lowest cursor", async () => {
    const { index, getOrdinalsInRange } = indexOver([1, 2, 3, 5]);
    const scheduler = new CatchUpScheduler(
      fixedWatermark(5),
      index,
      defaultCatchUpConfig,
      logger,
    );
    const low = consumer("low", 0);
    const high = consumer("high", 3);
    scheduler.addConsumer(low.value, "host");
    scheduler.addConsumer(high.value, "host");

    await scheduler.sweepNow();

    expect(getOrdinalsInRange).toHaveBeenCalledTimes(1);
    expect(low.calls).toEqual([{ settled: 5, present: [1, 2, 3, 5] }]);
    expect(high.calls).toEqual([{ settled: 5, present: [1, 2, 3, 5] }]);
  });

  it("bounds a full page at its last ordinal, and a consumer past it reads its own", async () => {
    const { index, getOrdinalsInRange } = indexOver([1, 2, 3, 4, 5, 6]);
    const scheduler = new CatchUpScheduler(
      fixedWatermark(6),
      index,
      { ...defaultCatchUpConfig, sweepPageSize: 2 },
      logger,
    );
    const low = consumer("low", 0);
    const high = consumer("high", 4);
    scheduler.addConsumer(low.value, "host");
    scheduler.addConsumer(high.value, "projection");

    await scheduler.sweepNow();

    expect(getOrdinalsInRange).toHaveBeenCalledTimes(2);
    expect(low.calls).toEqual([{ settled: 2, present: [1, 2] }]);
    expect(high.calls).toEqual([{ settled: 6, present: [5, 6] }]);
  });

  it("keeps sweeping the others when one consumer throws", async () => {
    const { index } = indexOver([1]);
    const scheduler = new CatchUpScheduler(
      fixedWatermark(1),
      index,
      defaultCatchUpConfig,
      logger,
    );
    vi.spyOn(logger, "error").mockImplementation(() => {});
    const failing = consumer("failing", 0, () =>
      Promise.reject(new Error("boom")),
    );
    const healthy = consumer("healthy", 0);
    scheduler.addConsumer(failing.value, "host");
    scheduler.addConsumer(healthy.value, "host");

    const results = await scheduler.sweepNow();

    expect(results.map((result) => result.consumerId)).toEqual(["healthy"]);
    expect(healthy.calls).toHaveLength(1);
  });

  it("ticks on its interval only while it has consumers, and stops", async () => {
    vi.useFakeTimers();
    try {
      const watermark = fixedWatermark(0);
      const { index } = indexOver([]);
      const scheduler = new CatchUpScheduler(
        watermark,
        index,
        { ...defaultCatchUpConfig, intervalMs: 100 },
        logger,
      );
      scheduler.start();
      await vi.advanceTimersByTimeAsync(250);
      expect(watermark.refresh).not.toHaveBeenCalled();

      scheduler.addConsumer(consumer("c", 0).value, "host");
      await vi.advanceTimersByTimeAsync(250);
      expect(watermark.refresh).toHaveBeenCalledTimes(2);

      await scheduler.stop();
      await vi.advanceTimersByTimeAsync(500);
      expect(watermark.refresh).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  describe("observability", () => {
    it("reports a sweep that moved, and skips one that did nothing", async () => {
      const { index } = indexOver([1]);
      const onSwept = vi.fn();
      const scheduler = new CatchUpScheduler(
        fixedWatermark(1),
        index,
        defaultCatchUpConfig,
        logger,
        { onSwept, describeSessions: () => Promise.resolve([]) },
      );
      scheduler.addConsumer(consumer("moving", 0).value, "projection");
      scheduler.addConsumer(consumer("idle", 1).value, "host");

      await scheduler.sweepNow();

      expect(onSwept).toHaveBeenCalledTimes(1);
      expect(onSwept).toHaveBeenCalledWith(
        expect.objectContaining({ consumerId: "moving", from: 0, to: 1 }),
        "projection",
      );
    });

    it("warns once, naming the sessions, when the watermark is held", async () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(1_000_000);
        const watermark: ISettledWatermark = {
          settledThrough: 4,
          refresh: () => Promise.resolve(4),
          onAdvance: () => () => {},
          status: () => ({
            head: 9,
            settledThrough: 4,
            waitingOn: ["77"],
            stalledSinceUtcMs: 1_000_000 - 61_000,
          }),
        };
        const warnLogger = new ConsoleLogger(["test"]);
        const warn = vi.spyOn(warnLogger, "warn").mockImplementation(() => {});
        const describeSessions = vi.fn(() =>
          Promise.resolve([
            {
              pid: 42,
              applicationName: "batch-import",
              state: "idle in transaction",
              xactStart: "2026-09-25T00:00:00.000Z",
              xid: "77",
            },
          ]),
        );
        const scheduler = new CatchUpScheduler(
          watermark,
          indexOver([]).index,
          defaultCatchUpConfig,
          warnLogger,
          { onSwept: () => {}, describeSessions },
        );
        scheduler.addConsumer(consumer("c", 4).value, "host");

        await scheduler.sweepNow();
        await scheduler.sweepNow();

        const held = warn.mock.calls.filter(([message]) =>
          String(message).startsWith("settled watermark held"),
        );
        expect(held).toHaveLength(1);
        expect(held[0]).toEqual([
          expect.any(String),
          4,
          9,
          61_000,
          "77",
          expect.stringContaining("pid 42 batch-import"),
        ]);
        expect(describeSessions).toHaveBeenCalledWith(["77"]);
      } finally {
        vi.useRealTimers();
      }
    });

    it("warns once when a consumer's cursor is held past the limit", async () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(0);
        const warnLogger = new ConsoleLogger(["test"]);
        const warn = vi.spyOn(warnLogger, "warn").mockImplementation(() => {});
        vi.spyOn(warnLogger, "error").mockImplementation(() => {});
        const stuck: ICatchUpConsumer = {
          consumerId: "stuck",
          appliedThrough: 2,
          trackedAbove: 0,
          sweep: () =>
            Promise.resolve({
              consumerId: "stuck",
              from: 2,
              to: 2,
              durationMs: 0,
              replayed: 0,
              reapplied: 0,
            }),
        };
        const scheduler = new CatchUpScheduler(
          fixedWatermark(5),
          indexOver([3, 4, 5]).index,
          { ...defaultCatchUpConfig, stuckWarnMs: 1000 },
          warnLogger,
        );
        scheduler.addConsumer(stuck, "host");

        await scheduler.sweepNow();
        vi.setSystemTime(1500);
        await scheduler.sweepNow();
        await scheduler.sweepNow();

        const held = warn.mock.calls.filter(([message]) =>
          String(message).includes("cursor held at"),
        );
        expect(held).toEqual([[expect.any(String), "stuck", 2, 1500, 5]]);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
