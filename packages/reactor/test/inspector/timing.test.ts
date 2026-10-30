import type {
  ProcessorTiming,
  ProcessorTimingCounters,
  ProcessorTimingHorizon,
  TrackedProcessor,
} from "@powerhousedao/shared/processors";
import { describe, expect, it } from "vitest";
import type { CatchUpStatus } from "../../src/catch-up/types.js";
import {
  computeProcessorTiming,
  formatCount,
  formatDuration,
  isCatchingUp,
  rankSlowest,
  renderDoneSummary,
  renderSlowLine,
} from "../../src/inspector/timing.js";

function counters(
  partial: Partial<ProcessorTimingCounters> = {},
): ProcessorTimingCounters {
  return {
    batches: 0,
    opsDelivered: 0,
    opsScanned: 0,
    opsMatched: 0,
    pages: 0,
    handlerMs: 0,
    maxBatchMs: 0,
    readMs: 0,
    lookupMs: 0,
    fillMs: 0,
    slotWaitMs: 0,
    pauseMs: 0,
    errors: 0,
    ...partial,
  };
}

function horizon(
  replay: Partial<ProcessorTimingCounters>,
  ordinalsAdvanced = 0,
): ProcessorTimingHorizon {
  const merged = counters(replay);
  return {
    live: counters(),
    replay: merged,
    ordinalsAdvanced,
    busyMs: merged.handlerMs + merged.readMs + merged.lookupMs + merged.fillMs,
  };
}

function timing(
  window: ProcessorTimingHorizon,
  total = window,
  windowMs = 10_000,
): ProcessorTiming {
  return {
    processorId: "p",
    name: "Index",
    driveLabel: "files",
    factoryId: "f",
    driveId: "d",
    sinceUtcMs: 5,
    total,
    window,
    windowMs,
    currentRun: null,
    lastRun: null,
    lastBatch: null,
    byDocumentType: [],
  };
}

function tracked(partial: Partial<TrackedProcessor> = {}): TrackedProcessor {
  return {
    processorId: "f:d:0",
    factoryId: "f",
    driveId: "d",
    processorIndex: 0,
    record: {
      processor: {
        onOperations: () => Promise.resolve(),
        onDisconnect: () => Promise.resolve(),
      },
      filter: {},
    },
    lastOrdinal: 100,
    status: "active",
    lastError: undefined,
    lastErrorTimestamp: undefined,
    floor: 0,
    runFrom: 0,
    phase: "catching-up",
    retry: () => Promise.resolve(),
    name: "Index",
    driveLabel: "files",
    ...partial,
  };
}

const catchUp = { watermark: { head: 1100 } } as CatchUpStatus;

describe("computeProcessorTiming", () => {
  it("derives lag, rates and eta from the catch-up head", () => {
    const report = computeProcessorTiming(
      [
        tracked({
          timing: () =>
            timing(horizon({ opsDelivered: 500, handlerMs: 10 }, 1000)),
          queueDepth: () => ({ tasks: 2, ops: 30 }),
        }),
      ],
      catchUp,
      "basic",
      60_000,
    );
    expect(report).toMatchObject({ head: 1100, headKnown: true });
    expect(report.processors[0]).toMatchObject({
      name: "Index",
      driveLabel: "files",
      queueDepth: { tasks: 2, ops: 30 },
      ordinalsBehind: 1000,
      opsPerSecond: 50,
      ordinalsPerSecond: 100,
      etaMs: 10_000,
    });
  });

  it("falls back to the highest cursor without a catch-up status", () => {
    const report = computeProcessorTiming(
      [tracked({ lastOrdinal: 7 }), tracked({ lastOrdinal: 40 })],
      undefined,
      "off",
      60_000,
    );
    expect(report).toMatchObject({ head: 40, headKnown: false });
    expect(report.processors[0]!.ordinalsBehind).toBe(33);
  });

  it("names a row at off, with its numbers null", () => {
    const report = computeProcessorTiming(
      [
        tracked({
          timing: () => undefined,
          queueDepth: () => ({ tasks: 1, ops: 2 }),
        }),
      ],
      catchUp,
      "off",
      60_000,
    );
    expect(report.processors[0]).toMatchObject({
      name: "Index",
      queueDepth: { tasks: 1, ops: 2 },
      ordinalsBehind: 1000,
      total: null,
      window: null,
      etaMs: null,
    });
  });

  it("gives no eta to a live processor", () => {
    const report = computeProcessorTiming(
      [
        tracked({
          phase: "live",
          timing: () => timing(horizon({ handlerMs: 1 }, 100)),
        }),
      ],
      catchUp,
      "basic",
      60_000,
    );
    expect(report.processors[0]!.etaMs).toBeNull();
  });

  it("names a processor bound by nothing but its index", () => {
    const { name, driveLabel } = computeProcessorTiming(
      [tracked({ name: undefined, driveLabel: undefined })],
      undefined,
      "off",
      60_000,
    ).processors[0]!;
    expect(name).toBe("#0");
    expect(driveLabel).toBe("d");
  });
});

describe("rankSlowest", () => {
  const report = computeProcessorTiming(
    [
      tracked({
        name: "Small",
        timing: () => timing(horizon({ readMs: 10 })),
      }),
      tracked({
        name: "Big",
        timing: () =>
          timing(
            horizon({ handlerMs: 100, readMs: 200, fillMs: 50 }),
            horizon({ handlerMs: 900 }),
          ),
      }),
      tracked({ name: "Idle", timing: () => timing(horizon({})) }),
      tracked({ name: "Off", timing: () => undefined }),
    ],
    catchUp,
    "basic",
    60_000,
  );

  it("orders by busy time and leaves idle rows out", () => {
    const rows = rankSlowest(report, 5);
    expect(rows.map((row) => row.label)).toEqual([
      "Big · files",
      "Small · files",
    ]);
    expect(rows[0]).toMatchObject({
      busyMs: 350,
      handlerMs: 100,
      readMs: 200,
      fillMs: 50,
    });
  });

  it("stops at top", () => {
    expect(rankSlowest(report, 1)).toHaveLength(1);
    expect(rankSlowest(report, 0)).toHaveLength(0);
  });

  it("ranks the total horizon when asked", () => {
    expect(rankSlowest(report, 1, "total")[0]!.busyMs).toBe(900);
  });
});

describe("formatting", () => {
  it.each([
    [4_100, "4.1s"],
    [41_200, "41s"],
    [130_000, "2m10s"],
    [3_900_000, "1h05m"],
  ])("formats %d ms as %s", (ms, text) => {
    expect(formatDuration(ms)).toBe(text);
  });

  it.each([
    [410, "410"],
    [3_100, "3.1k"],
    [12_400, "12.4k"],
    [1_610_000, "1.61M"],
  ])("formats %d as %s", (value, text) => {
    expect(formatCount(value)).toBe(text);
  });

  const row = {
    label: "FilesIndex · files",
    busyMs: 41_200,
    handlerMs: 12_000,
    readMs: 25_100,
    fillMs: 4_100,
    opsPerSecond: 3_100,
    ordinalsBehind: 182_400,
    etaMs: 59_000,
  };

  it("renders the slowest line, leaving out an unknown eta", () => {
    expect(renderSlowLine([row], 60_000)).toBe(
      "catch-up slowest (60 s): FilesIndex·files 41s (handler 12s read 25s fill 4.1s) 3.1k op/s eta 59s",
    );
    expect(renderSlowLine([{ ...row, etaMs: null }], 60_000)).not.toContain(
      "eta",
    );
  });

  it("renders the done summary with and without rows", () => {
    expect(renderDoneSummary([row], 252_000)).toBe(
      "catch-up done in 4m12s; slowest since start: FilesIndex·files 41s",
    );
    expect(renderDoneSummary([], 5_000)).toBe("catch-up done in 5.0s");
  });

  it("tells a catching-up reactor from a live one", () => {
    const report = computeProcessorTiming(
      [tracked({ phase: "live" })],
      undefined,
      "basic",
      1,
    );
    expect(isCatchingUp(report)).toBe(false);
    expect(
      isCatchingUp(computeProcessorTiming([tracked()], undefined, "basic", 1)),
    ).toBe(true);
  });
});
