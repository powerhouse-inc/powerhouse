import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import { describe, expect, it, vi } from "vitest";
import {
  ProcessorStats,
  ProcessorTimingSettings,
  type ProcessorTimingOptions,
} from "../../src/processors/processor-stats.js";
import { createMockLogger } from "../factories.js";

function op(ordinal: number, documentType = "a/b"): OperationWithContext {
  return {
    context: { ordinal, documentType },
  } as unknown as OperationWithContext;
}

function clocked(options: ProcessorTimingOptions = {}) {
  let time = 1_000_000;
  const settings = new ProcessorTimingSettings({
    level: "basic",
    now: () => time,
    utcNow: () => time,
    ...options,
  });
  const stats = new ProcessorStats(settings, {
    processorId: "p",
    name: "Index",
    driveLabel: "files",
    factoryId: "f",
    driveId: "d",
  });
  return {
    settings,
    stats,
    tick: (ms: number) => {
      time += ms;
    },
  };
}

describe("ProcessorStats", () => {
  it("keeps live and replay apart and sums busy time over both", () => {
    const { stats, tick } = clocked();
    const replay = stats.mark();
    tick(100);
    stats.recordRead(replay, 500);
    const lookup = stats.mark();
    tick(10);
    stats.recordLookup("replay", lookup);
    const fill = stats.mark();
    tick(20);
    stats.recordFill(fill);
    const handler = stats.mark();
    tick(30);
    stats.recordBatch("replay", handler, [op(1), op(2)], false);
    const live = stats.mark();
    tick(5);
    stats.recordBatch("live", live, [op(3)], false);

    const { total } = stats.snapshot()!;
    expect(total.replay).toMatchObject({
      batches: 1,
      opsDelivered: 2,
      opsScanned: 500,
      pages: 1,
      handlerMs: 30,
      readMs: 100,
      lookupMs: 10,
      fillMs: 20,
    });
    expect(total.live).toMatchObject({
      batches: 1,
      opsDelivered: 1,
      handlerMs: 5,
    });
    expect(total.busyMs).toBe(165);
  });

  it("leaves throttling out of busy time", () => {
    const { stats, tick } = clocked();
    const slot = stats.mark();
    tick(1000);
    stats.recordSlotWait(slot);
    const pause = stats.mark();
    tick(1000);
    stats.recordPause(pause);

    const { total } = stats.snapshot()!;
    expect(total.replay.slotWaitMs).toBe(1000);
    expect(total.replay.pauseMs).toBe(1000);
    expect(total.busyMs).toBe(0);
  });

  it("ages a bucket out of the window but keeps it in the total", () => {
    const { stats, tick } = clocked({ windowMs: 60_000 });
    const mark = stats.mark();
    tick(100);
    stats.recordBatch("live", mark, [op(1)], false);

    tick(30_000);
    expect(stats.snapshot()!.window.live.batches).toBe(1);

    tick(31_000);
    const later = stats.snapshot()!;
    expect(later.window.live.batches).toBe(0);
    expect(later.total.live.batches).toBe(1);
    expect(later.windowMs).toBe(60_000);
  });

  it("reports a shorter window right after the start", () => {
    const { stats, tick } = clocked({ windowMs: 60_000 });
    tick(5_000);
    expect(stats.snapshot()!.windowMs).toBe(5_000);
  });

  it("opens a run once and moves it to the last run when it ends", () => {
    const { stats, tick } = clocked();
    stats.startRun(10);
    stats.startRun(99);
    const read = stats.mark();
    tick(50);
    stats.recordRead(read, 100);
    stats.recordAdvance(100);

    const running = stats.snapshot()!;
    expect(running.currentRun).toMatchObject({
      runFrom: 10,
      ordinalsAdvanced: 100,
    });
    expect(running.currentRun?.counters.readMs).toBe(50);

    tick(50);
    stats.endRun();
    const done = stats.snapshot()!;
    expect(done.currentRun).toBeNull();
    expect(done.lastRun).toMatchObject({
      durationMs: 100,
      ordinals: 100,
      busyMs: 50,
    });
  });

  it("keeps the last run when a later one finds nothing to do", () => {
    const { stats } = clocked();
    stats.startRun(0);
    stats.recordAdvance(10);
    stats.endRun();
    stats.startRun(10);
    stats.endRun();
    expect(stats.snapshot()!.lastRun?.ordinals).toBe(10);
  });

  it("collects nothing at off and never reads a clock", () => {
    const now = vi.fn(() => 0);
    const settings = new ProcessorTimingSettings({ now, utcNow: now });
    const stats = new ProcessorStats(settings, {
      processorId: "p",
      name: "Index",
      driveLabel: "files",
      factoryId: "f",
      driveId: "d",
    });
    now.mockClear();

    const mark = stats.mark();
    expect(mark).toBe(-1);
    stats.recordBatch("live", mark, [op(1)], false);
    stats.recordRead(mark, 5);
    stats.recordScanned("live", 5);
    stats.recordAdvance(5);
    stats.startRun(0);
    stats.endRun();

    expect(now).not.toHaveBeenCalled();
    expect(stats.snapshot()).toBeUndefined();
  });

  it("keeps the numbers across a change to off and back", () => {
    const { settings, stats, tick } = clocked();
    const mark = stats.mark();
    tick(10);
    stats.recordBatch("live", mark, [op(1)], false);

    settings.level = "off";
    stats.recordBatch("live", stats.mark(), [op(2)], false);
    expect(stats.snapshot()).toBeUndefined();

    settings.level = "basic";
    const { total } = stats.snapshot()!;
    expect(total.live.batches).toBe(1);
    expect(total.live.handlerMs).toBe(10);
  });

  it("ignores a mark taken at off when the level rises before it is recorded", () => {
    const { settings, stats } = clocked({ level: "off" });
    const mark = stats.mark();
    settings.level = "basic";
    stats.recordBatch("live", mark, [op(1)], false);
    expect(stats.snapshot()!.total.live.batches).toBe(0);
  });

  it("resets every horizon", () => {
    const { stats, tick } = clocked();
    const mark = stats.mark();
    tick(10);
    stats.recordBatch("live", mark, [op(1)], false);
    tick(10);

    stats.reset();

    const snapshot = stats.snapshot()!;
    expect(snapshot.total.busyMs).toBe(0);
    expect(snapshot.window.busyMs).toBe(0);
    expect(snapshot.lastBatch).toBeNull();
    expect(snapshot.sinceUtcMs).toBe(1_000_020);
  });

  it("attributes handler time by document type at detailed, summing to the whole", () => {
    const { stats, tick } = clocked({ level: "detailed" });
    const mark = stats.mark();
    tick(100);
    stats.recordBatch(
      "replay",
      mark,
      [op(1, "a"), op(2, "a"), op(3, "a"), op(4, "b")],
      false,
    );

    const { byDocumentType } = stats.snapshot()!;
    expect(byDocumentType).toEqual([
      { documentType: "a", ops: 3, handlerMs: 75 },
      { documentType: "b", ops: 1, handlerMs: 25 },
    ]);
  });

  it("attributes nothing to document types at basic", () => {
    const { stats, tick } = clocked();
    const mark = stats.mark();
    tick(100);
    stats.recordBatch("replay", mark, [op(1)], false);
    expect(stats.snapshot()!.byDocumentType).toEqual([]);
  });

  it("warns of a slow batch at detailed only", () => {
    let time = 0;
    const warn = vi.fn();
    const logger = { ...createMockLogger(), warn };
    const settings = new ProcessorTimingSettings({
      level: "basic",
      slowBatchMs: 100,
      now: () => time,
      utcNow: () => time,
    });
    const stats = new ProcessorStats(
      settings,
      {
        processorId: "p",
        name: "Index",
        driveLabel: "files",
        factoryId: "f",
        driveId: "d",
      },
      logger,
    );

    let mark = stats.mark();
    time += 500;
    stats.recordBatch("live", mark, [op(1)], false);
    expect(warn).not.toHaveBeenCalled();

    settings.level = "detailed";
    mark = stats.mark();
    time += 500;
    stats.recordBatch("live", mark, [op(7)], false);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("records a failed batch's time as an error, not as delivered", () => {
    const { stats, tick } = clocked();
    const mark = stats.mark();
    tick(10);
    stats.recordBatch("live", mark, [op(1)], true);
    expect(stats.snapshot()!.total.live).toMatchObject({
      batches: 1,
      opsDelivered: 0,
      errors: 1,
      handlerMs: 10,
    });
  });
});
