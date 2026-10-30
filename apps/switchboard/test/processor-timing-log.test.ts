import type { InspectorProcessorTimingReport } from "@powerhousedao/reactor";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startProcessorTimingLog } from "../src/processor-timing-log.mjs";

function report(
  level: InspectorProcessorTimingReport["level"],
  phase: "catching-up" | "live",
): InspectorProcessorTimingReport {
  const counters = {
    batches: 1,
    opsDelivered: 1,
    opsScanned: 1,
    opsMatched: 1,
    pages: 1,
    handlerMs: 2_000,
    maxBatchMs: 0,
    readMs: 0,
    lookupMs: 0,
    fillMs: 0,
    slotWaitMs: 0,
    pauseMs: 0,
    errors: 0,
  };
  const horizon = {
    live: { ...counters, handlerMs: 0 },
    replay: counters,
    ordinalsAdvanced: 1,
    busyMs: 2_000,
  };
  return {
    level,
    windowMs: 60_000,
    head: 10,
    headKnown: true,
    processors: [
      {
        processorId: "p",
        name: "Index",
        driveLabel: "files",
        factoryId: "f",
        driveId: "d",
        phase,
        lastOrdinal: 5,
        queueDepth: { tasks: 0, ops: 0 },
        ordinalsBehind: 5,
        opsPerSecond: 1,
        ordinalsPerSecond: 1,
        etaMs: null,
        sinceUtcMs: 0,
        total: horizon,
        window: horizon,
        windowMs: 60_000,
        currentRun: null,
        lastRun: null,
        lastBatch: null,
        byDocumentType: [],
      },
    ],
  };
}

describe("startProcessorTimingLog", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("logs while catching up and one summary when it ends", () => {
    let current = report("basic", "catching-up");
    const lines: string[] = [];
    const stop = startProcessorTimingLog({
      intervalMs: 1_000,
      read: () => current,
      log: (line) => lines.push(line),
    });

    vi.advanceTimersByTime(2_000);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("catch-up slowest (60 s): Index·files 2.0s");

    current = report("basic", "live");
    vi.advanceTimersByTime(3_000);
    expect(lines).toHaveLength(3);
    expect(lines[2]).toMatch(/^catch-up done in .*Index·files 2\.0s$/);
    stop();
  });

  it("stays quiet when live, when off, and after the stop", () => {
    let current = report("basic", "live");
    const log = vi.fn();
    const stop = startProcessorTimingLog({
      intervalMs: 1_000,
      read: () => current,
      log,
    });
    vi.advanceTimersByTime(2_000);

    current = report("off", "catching-up");
    vi.advanceTimersByTime(2_000);
    stop();

    current = report("basic", "catching-up");
    vi.advanceTimersByTime(2_000);
    expect(log).not.toHaveBeenCalled();
  });
});
