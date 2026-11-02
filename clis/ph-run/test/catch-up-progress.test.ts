import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  IInspector,
  InspectorProcessorTimingReport,
  MemoryTelemetryReport,
  SlowProcessor,
} from "@powerhousedao/reactor";
import {
  inspectorProgressSource,
  progressRows,
  renderBars,
  renderLine,
  renderPriority,
  renderSlowest,
  startProgressDisplay,
  type ProgressPriority,
  type ProgressRow,
  type ProgressSnapshot,
  type ProgressStream,
} from "../src/services/run/catch-up-progress.js";
import { renderMemoryLine } from "../src/services/run/memory-line.js";

function stream(isTTY: boolean): ProgressStream & { out: string[] } {
  const out: string[] = [];
  return {
    out,
    isTTY,
    columns: 60,
    write: ((chunk: string | Uint8Array) => {
      out.push(
        typeof chunk === "string" ? chunk : Buffer.from(chunk).toString(),
      );
      return true;
    }) as ProgressStream["write"],
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const catchingUp: ProgressRow[] = [
  { label: "sektar", fraction: 0.62, state: "catching-up" },
  { label: "document-view", fraction: 1, state: "done" },
];

const dynamic6: ProgressPriority = {
  mode: "dynamic",
  level: 6,
  reason: "idle 14 s",
};

function snapshot(
  rows: readonly ProgressRow[],
  priority?: ProgressPriority,
): Promise<ProgressSnapshot> {
  return Promise.resolve({ rows, priority });
}

describe("renderBars", () => {
  it("fits every line to the terminal width and states the progress", () => {
    const lines = renderBars(catchingUp, 60);

    expect(lines).toHaveLength(2);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(60);
    expect(lines[0]).toMatch(/^sektar\s+█+░+\s+62%$/);
    expect(lines[1]).toMatch(/^document-view\s+█+\s+done$/);
  });

  it("keeps every line short of the last column", () => {
    for (const columns of [20, 48, 60, 80, 200]) {
      for (const line of renderBars(catchingUp, columns, dynamic6)) {
        expect(line.length).toBeLessThanOrEqual(columns - 1);
      }
    }
  });

  it("shrinks the label before the bar on a narrow terminal", () => {
    const [line] = renderBars(
      [
        {
          label: "attachment-reference-read-model",
          fraction: 0.5,
          state: "catching-up",
        },
      ],
      48,
    );

    expect(line.length).toBeLessThanOrEqual(47);
    expect(line).toMatch(/░/);
    expect(line).toMatch(/50%$/);
  });

  it("keeps the end of a long label, where processor factories differ", () => {
    const [line] = renderBars(
      [
        {
          label: "D:\\projects\\ph-win\\workspace\\sektar",
          fraction: 0,
          state: "errored",
        },
      ],
      80,
    );

    expect(line).toMatch(/^….*workspace\\sektar /);
    expect(line).toMatch(/errored$/);
  });
});

describe("progressRows", () => {
  it("names a project factory by its folder, with its drives, and maps phases", () => {
    const rows = progressRows({
      head: 100,
      headKnown: true,
      factories: [
        {
          factoryId: "D:\\projects\\ph-win\\workspace\\sektar",
          label: "sektar",
          driveCount: 8,
          phase: "catching-up",
          done: 31,
          total: 50,
          fraction: 0.62,
          processorsDone: 0,
          processors: [],
        },
        {
          factoryId: "@powerhousedao/vetra",
          label: "vetra",
          driveCount: 1,
          phase: "live",
          done: 0,
          total: 0,
          fraction: 1,
          processorsDone: 0,
          processors: [],
        },
        {
          factoryId: "broken",
          label: "broken",
          driveCount: 2,
          phase: "errored",
          done: 0,
          total: 10,
          fraction: 0,
          processorsDone: 0,
          processors: [],
        },
      ],
      readModels: [
        {
          consumerId: "document-view",
          thread: "host",
          appliedThrough: 100,
          head: 100,
          fraction: 1,
          complete: true,
          blocked: false,
        },
        {
          consumerId: "document-indexer",
          thread: "host",
          appliedThrough: 40,
          head: 100,
          fraction: 0.4,
          complete: false,
          blocked: true,
        },
      ],
    });

    expect(rows).toEqual([
      { label: "sektar (8 drives)", fraction: 0.62, state: "catching-up" },
      { label: "vetra (1 drive)", fraction: 1, state: "done" },
      { label: "broken (2 drives)", fraction: 0, state: "errored" },
      { label: "document-view", fraction: 1, state: "done" },
      { label: "document-indexer", fraction: 0.4, state: "errored" },
    ]);
  });
});

describe("renderLine", () => {
  it("lists only what is still catching up", () => {
    expect(renderLine(catchingUp)).toBe("catch-up: sektar 62%");
  });
});

describe("startProgressDisplay", () => {
  afterEach(() => vi.useRealTimers());

  it("draws the bars in a terminal and prints other output above them", async () => {
    const stdout = stream(true);
    const stderr = stream(true);
    const display = startProgressDisplay(() => snapshot(catchingUp), {
      stdout,
      stderr,
      pollMs: 60_000,
    });
    await settle();
    expect(stdout.out.join("")).toContain("62%");

    stdout.out.length = 0;
    stdout.write("a log line\n");

    const written = stdout.out.join("");
    expect(written.indexOf("\x1b[2A")).toBeLessThan(
      written.indexOf("a log line"),
    );
    expect(written.indexOf("a log line")).toBeLessThan(
      written.lastIndexOf("62%"),
    );
    display.stop();
  });

  it("does not redraw in the middle of a line another write left open", async () => {
    const stdout = stream(true);
    const display = startProgressDisplay(() => snapshot(catchingUp), {
      stdout,
      stderr: stream(true),
      pollMs: 60_000,
    });
    await settle();
    stdout.out.length = 0;

    stdout.write("partial ");
    expect(stdout.out.join("")).not.toContain("62%");
    stdout.write("line\n");
    expect(stdout.out.join("")).toContain("62%");
    display.stop();
  });

  it("removes the bars once everything is done, and restores the streams on stop", async () => {
    const stdout = stream(true);
    const stderr = stream(true);
    const original = stdout.write;
    let rows: ProgressRow[] = catchingUp;
    vi.useFakeTimers();
    const display = startProgressDisplay(() => snapshot(rows), {
      stdout,
      stderr,
      pollMs: 1_000,
    });
    await vi.advanceTimersByTimeAsync(0);
    rows = catchingUp.map((row) => ({ ...row, fraction: 1, state: "done" }));
    stdout.out.length = 0;
    await vi.advanceTimersByTimeAsync(1_000);

    expect(stdout.out.join("")).toContain("\x1b[0J");
    expect(stdout.out.join("")).not.toContain("█");

    display.stop();
    expect(stdout.write).toBe(original);
  });

  it("prints a progress line on a timer without a terminal, and leaves writes alone", async () => {
    const stdout = stream(false);
    const original = stdout.write;
    vi.useFakeTimers();
    const display = startProgressDisplay(() => snapshot(catchingUp), {
      stdout,
      stderr: stream(false),
      pollMs: 1_000,
      lineMs: 5_000,
    });
    await vi.advanceTimersByTimeAsync(4_000);

    expect(stdout.write).toBe(original);
    expect(
      stdout.out.filter((line) => line.startsWith("catch-up:")),
    ).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(
      stdout.out.filter((line) => line.startsWith("catch-up:")),
    ).toHaveLength(2);
    display.stop();
  });

  it("keeps the last rows when the reactor does not answer", async () => {
    const stdout = stream(false);
    let fail = false;
    vi.useFakeTimers();
    const display = startProgressDisplay(
      () => (fail ? Promise.reject(new Error("busy")) : snapshot(catchingUp)),
      { stdout, stderr: stream(false), pollMs: 1_000, lineMs: 1_000 },
    );
    await vi.advanceTimersByTimeAsync(0);
    fail = true;
    await vi.advanceTimersByTimeAsync(1_000);

    expect(stdout.out.at(-1)).toBe("catch-up: sektar 62%\n");
    display.stop();
  });
});

describe("catch-up priority", () => {
  afterEach(() => vi.useRealTimers());

  it("states a dynamic priority with its reason, and a fixed one without", () => {
    expect(renderPriority(dynamic6)).toBe(
      "catch-up priority 6 (dynamic, idle 14 s)",
    );
    expect(renderPriority({ mode: "fixed", level: 3, reason: "fixed" })).toBe(
      "catch-up priority 3 (fixed)",
    );
  });

  it("starts the bar block with the priority line", () => {
    const lines = renderBars(catchingUp, 60, dynamic6);

    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe("catch-up priority 6 (dynamic, idle 14 s)");
    expect(lines[1]).toMatch(/^sektar\s+█+░+\s+62%$/);
  });

  it("cuts the priority line short of the terminal's last column", () => {
    const [line] = renderBars(catchingUp, 20, dynamic6);

    expect(line).toBe("catch-up priority 6");
  });

  it("appends the priority to the plain line", () => {
    expect(renderLine(catchingUp, dynamic6)).toBe(
      "catch-up: sektar 62% · priority 6 dynamic",
    );
  });

  it("draws the priority above the bars in a terminal", async () => {
    const stdout = stream(true);
    const display = startProgressDisplay(() => snapshot(catchingUp, dynamic6), {
      stdout,
      stderr: stream(true),
      pollMs: 60_000,
    });
    await settle();

    const written = stdout.out.join("");
    expect(written.indexOf("catch-up priority 6 (dynamic, idle 14 s)")).toBe(0);
    expect(written).toContain("62%");
    stdout.out.length = 0;
    stdout.write("a log line\n");
    expect(stdout.out.join("").indexOf("\x1b[3A")).toBe(0);
    display.stop();
  });

  it("prints the priority on the plain line without a terminal", async () => {
    const stdout = stream(false);
    vi.useFakeTimers();
    const display = startProgressDisplay(
      () => snapshot(catchingUp, { mode: "fixed", level: 2, reason: "fixed" }),
      { stdout, stderr: stream(false), pollMs: 1_000, lineMs: 1_000 },
    );
    await vi.advanceTimersByTimeAsync(0);

    expect(stdout.out.at(-1)).toBe("catch-up: sektar 62% · priority 2 fixed\n");
    display.stop();
  });

  it("reads the priority from the inspector, and goes without when refused", async () => {
    const getCatchUpPriority = vi.fn(() =>
      Promise.resolve({
        mode: "dynamic",
        level: 5,
        settings: { slots: 4, pageSize: 500, pauseMs: 0, giveWay: "yield" },
        reason: "busy, healthy",
        sample: undefined,
      }),
    );
    const inspector = {
      getProcessors: () => Promise.resolve([]),
      getCatchUpStatus: () => Promise.reject(new Error("none")),
      getCatchUpPriority,
    } as unknown as IInspector;
    const source = inspectorProgressSource(inspector);

    await expect(source()).resolves.toEqual({
      rows: [],
      priority: { mode: "dynamic", level: 5, reason: "busy, healthy" },
    });

    getCatchUpPriority.mockRejectedValue(new Error("old host"));
    await expect(source()).resolves.toEqual({ rows: [], priority: undefined });
  });
});

const slowRow: SlowProcessor = {
  label: "FilesIndex · files",
  busyMs: 41_200,
  handlerMs: 12_000,
  readMs: 25_100,
  fillMs: 4_100,
  opsPerSecond: 3_100,
  ordinalsBehind: 182_400,
  etaMs: 59_000,
};

function horizon(busyMs: number) {
  const counters = {
    batches: 0,
    opsDelivered: 0,
    opsScanned: 0,
    opsMatched: 0,
    pages: 0,
    handlerMs: busyMs,
    maxBatchMs: 0,
    readMs: 0,
    lookupMs: 0,
    fillMs: 0,
    slotWaitMs: 0,
    pauseMs: 0,
    errors: 0,
  };
  return {
    live: { ...counters, handlerMs: 0 },
    replay: counters,
    ordinalsAdvanced: 0,
    busyMs,
  };
}

function report(
  level: InspectorProcessorTimingReport["level"],
  windowBusy = 4_000,
  totalBusy = 90_000,
): InspectorProcessorTimingReport {
  return {
    level,
    windowMs: 60_000,
    head: 100,
    headKnown: true,
    processors: [
      {
        processorId: "p",
        name: "FilesIndex",
        driveLabel: "files",
        factoryId: "f",
        driveId: "d",
        phase: "catching-up",
        lastOrdinal: 50,
        queueDepth: { tasks: 0, ops: 0 },
        ordinalsBehind: 50,
        opsPerSecond: 10,
        ordinalsPerSecond: 10,
        etaMs: 5_000,
        sinceUtcMs: 0,
        total: horizon(totalBusy),
        window: horizon(windowBusy),
        windowMs: 60_000,
        currentRun: null,
        lastRun: null,
        lastBatch: null,
        byDocumentType: [],
      },
    ],
  };
}

describe("the slowest processors", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("drops columns from the right as the console narrows, and keeps busy", () => {
    const header = (columns: number) =>
      renderSlowest([slowRow], columns, 20, 60_000)[0]!;
    expect(header(120)).toContain("handler");
    expect(header(120)).toContain("eta");
    expect(header(70)).not.toContain("eta");
    expect(header(70)).toContain("read");
    expect(header(45)).not.toContain("read");
    expect(header(45)).toContain("handler");
    expect(header(32)).toContain("busy");
    expect(header(32)).not.toContain("handler");
  });

  it.each([120, 80, 50, 30])(
    "never reaches the last column at %d columns",
    (columns) => {
      for (const line of renderSlowest([slowRow], columns, 32, 60_000)) {
        expect(line.length).toBeLessThan(columns);
      }
    },
  );

  it("renders nothing without rows", () => {
    expect(renderSlowest([], 120, 20, 60_000)).toEqual([]);
  });

  it("prints a slowest line after the catch-up line without a terminal", async () => {
    const stdout = stream(false);
    vi.useFakeTimers();
    const display = startProgressDisplay(
      () =>
        Promise.resolve({
          rows: catchingUp,
          priority: undefined,
          timing: report("basic"),
        }),
      { stdout, stderr: stream(false), pollMs: 1_000, lineMs: 1_000 },
    );
    await vi.advanceTimersByTimeAsync(0);

    expect(stdout.out.at(-2)).toBe("catch-up: sektar 62%\n");
    expect(stdout.out.at(-1)).toContain(
      "catch-up slowest (60 s): FilesIndex·files 4.0s",
    );
    display.stop();
  });

  it("draws the slowest block under the bars in a terminal", async () => {
    const stdout = stream(true);
    const display = startProgressDisplay(
      () =>
        Promise.resolve({
          rows: catchingUp,
          priority: undefined,
          timing: report("basic"),
        }),
      { stdout, stderr: stream(true), pollMs: 60_000 },
    );
    await settle();

    const written = stdout.out.join("");
    expect(written.indexOf("62%")).toBeLessThan(
      written.indexOf("slowest, last 60 s"),
    );
    expect(written).toContain("FilesIndex · files");
    display.stop();
  });

  it.each([
    ["timing is off", report("off"), 5],
    ["top is 0", report("basic"), 0],
    ["nothing is busy", report("basic", 0), 5],
    ["the reactor has no timing", undefined, 5],
  ])("hides them when %s", async (_, timing, top) => {
    const stdout = stream(true);
    const display = startProgressDisplay(
      () => Promise.resolve({ rows: catchingUp, priority: undefined, timing }),
      { stdout, stderr: stream(true), pollMs: 60_000, top },
    );
    await settle();

    expect(stdout.out.join("")).not.toContain("slowest");
    display.stop();
  });

  it("prints the done summary once, from the total horizon", async () => {
    const stdout = stream(false);
    vi.useFakeTimers();
    let rows: readonly ProgressRow[] = catchingUp;
    const display = startProgressDisplay(
      () =>
        Promise.resolve({
          rows,
          priority: undefined,
          timing: report("basic"),
        }),
      { stdout, stderr: stream(false), pollMs: 1_000, lineMs: 60_000 },
    );
    await vi.advanceTimersByTimeAsync(0);
    rows = [{ label: "sektar", fraction: 1, state: "done" }];
    await vi.advanceTimersByTimeAsync(3_000);

    const summaries = stdout.out.filter((line) =>
      line.startsWith("catch-up done in"),
    );
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toContain(
      "slowest since start: FilesIndex·files 1m30s",
    );
    display.stop();
  });

  it("reads timing from the inspector, and goes without when refused", async () => {
    const getProcessorTiming = vi.fn(() => Promise.resolve(report("basic")));
    const inspector = {
      getProcessors: () => Promise.resolve([]),
      getCatchUpStatus: () => Promise.reject(new Error("no catch-up")),
      getCatchUpPriority: () => Promise.reject(new Error("no priority")),
      getProcessorTiming,
    } as unknown as IInspector;
    const source = inspectorProgressSource(inspector);

    await expect(source()).resolves.toMatchObject({
      timing: { level: "basic" },
    });

    getProcessorTiming.mockRejectedValueOnce(new Error("older reactor"));
    await expect(source()).resolves.toMatchObject({ timing: undefined });
  });
});

describe("the memory line", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const GB = 1024 ** 3;
  const MB = 1024 ** 2;

  function memoryReport(
    outputs: MemoryTelemetryReport["outputs"] = ["memory", "console"],
  ): MemoryTelemetryReport {
    return {
      enabled: true,
      intervalMs: 30_000,
      consoleIntervalMs: 5_000,
      outputs,
      file: null,
      startedAt: null,
      summary: {
        windowMin: 30,
        mbPer1kOps: 17.2,
        postGcMbPer1kOps: 14,
        rssMbPerMin: 61.4,
        heapMbPerMin: 50,
        postGcMbPerMin: 48.9,
        externalMbPerMin: 0,
        pgliteMbPerMin: 0,
        verdict: "growing",
        topGauges: [
          {
            gauge: "processors.bufferedLiveOps",
            value: 88_112,
            perMin: 2_900,
            r: 0.9,
          },
        ],
        gauges: [],
      },
      samples: [
        {
          rss: 4.12 * GB,
          heapUsed: 2.35 * GB,
          postGcHeap: 2.1 * GB,
          workers: {
            "pglite:reactor": { heapUsed: 20 * MB, wasm: 2 * GB },
            "pglite:read": { heapUsed: 20 * MB, wasm: 1.6 * GB },
            "executor#1": { heapUsed: 64 * MB },
          },
          delta: { s: 30, opsWritten: 1830, rss: 0, heapUsed: 0 },
        } as unknown as MemoryTelemetryReport["samples"][number],
      ],
    };
  }

  it("states rates, stores, operations and the fastest gauge", () => {
    expect(renderMemoryLine(memoryReport())).toBe(
      "memory: rss 4.12 GB (+61 MB/min) · heap 2.35 GB, post-GC 2.10 GB (+49 MB/min) · pglite 3.60 GB · 1830 ops/30s, 17 MB/1k ops · top: processors.bufferedLiveOps +2.9k/min",
    );
  });

  it("goes without what it does not have yet", () => {
    const report = memoryReport();
    const line = renderMemoryLine({
      ...report,
      summary: null,
      samples: [{ ...report.samples[0]!, postGcHeap: null, workers: {} }],
    });
    expect(line).toBe("memory: rss 4.12 GB · heap 2.35 GB · 1830 ops/30s");
    expect(renderMemoryLine({ ...report, samples: [] })).toBeUndefined();
  });

  it("prints through stderr at its own cadence, catching up or not", async () => {
    const stdout = stream(false);
    const stderr = stream(false);
    vi.useFakeTimers();
    const display = startProgressDisplay(
      () =>
        Promise.resolve({
          rows: [],
          priority: undefined,
          memory: memoryReport(),
        }),
      { stdout, stderr, pollMs: 1_000 },
    );
    await vi.advanceTimersByTimeAsync(4_000);
    expect(stderr.out).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(2_000);
    expect(stderr.out).toHaveLength(1);
    expect(stderr.out[0]).toMatch(/^memory: rss/);
    display.stop();
  });

  it("stays quiet without the console output", async () => {
    const stderr = stream(false);
    vi.useFakeTimers();
    const display = startProgressDisplay(
      () =>
        Promise.resolve({
          rows: [],
          priority: undefined,
          memory: memoryReport(["memory", "file"]),
        }),
      { stdout: stream(false), stderr, pollMs: 1_000 },
    );
    await vi.advanceTimersByTimeAsync(20_000);
    expect(stderr.out).toHaveLength(0);
    display.stop();
  });
});
