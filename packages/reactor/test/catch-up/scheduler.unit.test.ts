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
});
