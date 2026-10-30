import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventBus } from "../../src/events/event-bus.js";
import { ReactorEventTypes } from "../../src/events/types.js";
import {
  parseMemoryTelemetryOutputs,
  parseMemoryTelemetrySwitch,
  resolveMemoryTelemetryConfig,
} from "../../src/telemetry/config.js";
import {
  correlation,
  deriveRates,
  gaugeGrowth,
  slope,
} from "../../src/telemetry/correlation.js";
import {
  registerTelemetryGauge,
  registerTelemetryWorker,
} from "../../src/telemetry/gauges.js";
import { MemoryTelemetry } from "../../src/telemetry/memory-telemetry.js";
import { Ring } from "../../src/telemetry/ring.js";
import type {
  IMemorySampler,
  IMemoryTelemetrySink,
  MemorySample,
  ProcessMemorySample,
} from "../../src/telemetry/types.js";

const MB = 1024 * 1024;

function memory(rss = 100 * MB): ProcessMemorySample {
  return {
    rss,
    maxRss: rss,
    heapUsed: rss / 2,
    heapTotal: rss,
    heapLimit: 4096 * MB,
    external: 0,
    arrayBuffers: 0,
    mallocedMemory: 0,
    postGcHeap: rss / 4,
    postGcAt: null,
    spaces: { old: 0, lo: 0, code: 0, new: 0 },
    contexts: { native: 1, detached: 0 },
    loop: { p50: 1, p99: 2 },
    freemem: 1000 * MB,
  };
}

function fakeSampler(read: () => ProcessMemorySample = memory) {
  return {
    start: vi.fn(),
    stop: vi.fn(),
    sample: vi.fn(read),
  } satisfies IMemorySampler;
}

function sample(
  minute: number,
  rssMb: number,
  ops: number,
  postGcMb: number | null = rssMb / 2,
): MemorySample {
  return {
    ...memory(rssMb * MB),
    postGcHeap: postGcMb === null ? null : postGcMb * MB,
    t: new Date(Date.UTC(2026, 9, 30, 12, minute)).toISOString(),
    up: minute * 60,
    workers: {},
    counters: {
      jobsEnqueued: 0,
      jobsReadReady: 0,
      jobsFailed: 0,
      opsWritten: ops,
      readModelBatches: 0,
      readModelOps: 0,
      catchUpSweeps: 0,
    },
    delta: { s: 60, opsWritten: 0, rss: 0, heapUsed: 0 },
    gauges: {},
    derived: deriveRates([], 30),
  };
}

function subscriberCount(bus: EventBus): number {
  let count = 0;
  for (const subscribers of bus.eventTypeToSubscribers.values()) {
    count += subscribers.length;
  }
  return count;
}

describe("Ring", () => {
  it("keeps the newest items, oldest first, past its capacity", () => {
    const ring = new Ring<number>(3);
    for (const n of [1, 2, 3, 4, 5]) ring.push(n);
    expect(ring.toArray()).toEqual([3, 4, 5]);
    expect(ring.last()).toBe(5);
    expect(ring.size).toBe(3);
  });

  it("reads back in order before it fills", () => {
    const ring = new Ring<number>(3);
    ring.push(1);
    ring.push(2);
    expect(ring.toArray()).toEqual([1, 2]);
    expect(ring.last()).toBe(2);
  });
});

describe("correlation math", () => {
  it("fits a slope", () => {
    expect(
      slope([
        { x: 0, y: 1 },
        { x: 1, y: 3 },
        { x: 2, y: 5 },
      ]),
    ).toBeCloseTo(2);
    expect(slope([{ x: 0, y: 1 }])).toBe(0);
  });

  it("correlates, and gives nothing for a flat series", () => {
    expect(correlation([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
    expect(correlation([1, 2, 3], [6, 4, 2])).toBeCloseTo(-1);
    expect(correlation([1, 1, 1], [1, 2, 3])).toBeNull();
  });

  it("reports MB per 1000 operations only past 1000 written", () => {
    const busy = deriveRates([sample(0, 100, 0), sample(10, 200, 5000)], 30);
    expect(busy.mbPer1kOps).toBeCloseTo(20);
    expect(busy.rssMbPerMin).toBeCloseTo(10);
    expect(busy.postGcMbPerMin).toBeCloseTo(5);

    const idle = deriveRates([sample(0, 100, 0), sample(10, 200, 500)], 30);
    expect(idle.mbPer1kOps).toBeNull();
  });

  it("calls a slope under 5 MB/min steady, and tells growth without writes", () => {
    expect(
      deriveRates([sample(0, 100, 0), sample(10, 110, 5000)], 30).verdict,
    ).toBe("steady");
    expect(
      deriveRates([sample(0, 100, 0), sample(10, 300, 5000)], 30).verdict,
    ).toBe("growing");
    expect(
      deriveRates([sample(0, 100, 7), sample(10, 300, 7)], 30).verdict,
    ).toBe("growing-without-ops");
  });

  it("reads no post-GC rate before a major GC", () => {
    const rates = deriveRates(
      [sample(0, 100, 0, null), sample(10, 200, 5000, null)],
      30,
    );
    expect(rates.postGcMbPerMin).toBeNull();
    expect(rates.postGcMbPer1kOps).toBeNull();
    expect(rates.verdict).toBe("steady");
  });

  it("ranks gauges by growth and correlates them with the post-GC heap", () => {
    const at = (
      minute: number,
      jobs: number,
      flat: number,
      postGc: number,
    ) => ({
      ...sample(minute, 100, 0, postGc),
      gauges: { tracker: { jobs, flat } },
    });
    const growth = gaugeGrowth([
      at(0, 0, 5, 10),
      at(1, 100, 5, 20),
      at(2, 200, 5, 30),
    ]);
    expect(growth[0]).toMatchObject({ gauge: "tracker.jobs", value: 200 });
    expect(growth[0]!.perMin).toBeCloseTo(100);
    expect(growth[0]!.r).toBeCloseTo(1);
    expect(growth[1]).toMatchObject({ gauge: "tracker.flat", r: null });
  });
});

describe("configuration", () => {
  it("fills in the decided defaults", () => {
    expect(resolveMemoryTelemetryConfig()).toMatchObject({
      enabled: false,
      intervalMs: 30_000,
      outputs: ["memory", "file"],
      fileMaxMb: 10,
      fileKeep: 5,
      ringSize: 720,
      workers: true,
      windowMin: 30,
    });
  });

  it("holds the interval at its minimum and always keeps memory", () => {
    expect(
      resolveMemoryTelemetryConfig({ intervalMs: 10, outputs: ["console"] }),
    ).toMatchObject({ intervalMs: 1000, outputs: ["memory", "console"] });
  });

  it("parses outputs, refusing an unknown one", () => {
    expect(parseMemoryTelemetryOutputs("file, console")).toEqual([
      "memory",
      "file",
      "console",
    ]);
    expect(parseMemoryTelemetryOutputs("otel")).toBeUndefined();
  });

  it.each([
    ["on", true],
    ["TRUE", true],
    ["1", true],
    ["off", false],
    ["false", false],
    ["0", false],
    ["maybe", undefined],
  ])("reads %s", (raw, expected) => {
    expect(parseMemoryTelemetrySwitch(raw)).toBe(expected);
  });
});

describe("MemoryTelemetry", () => {
  let now: number;

  beforeEach(() => {
    vi.useFakeTimers();
    now = Date.UTC(2026, 9, 30, 12);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function telemetry(
    sampler: IMemorySampler = fakeSampler(),
    options: Partial<ConstructorParameters<typeof MemoryTelemetry>[0]> = {},
  ) {
    return new MemoryTelemetry({
      sampler,
      now: () => now,
      config: { workers: false, outputs: ["memory"] },
      ...options,
    });
  }

  async function tick(ms: number) {
    now += ms;
    await vi.advanceTimersByTimeAsync(ms);
  }

  it("does nothing until started, and leaves nothing behind when stopped", async () => {
    const bus = new EventBus();
    const sampler = fakeSampler();
    const instance = telemetry(sampler);
    instance.attachEventBus(bus);

    expect(sampler.start).not.toHaveBeenCalled();
    expect(subscriberCount(bus)).toBe(0);
    expect(vi.getTimerCount()).toBe(0);

    instance.start();
    expect(subscriberCount(bus)).toBeGreaterThan(0);
    await tick(0);

    instance.stop();
    expect(subscriberCount(bus)).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(sampler.stop).toHaveBeenCalledOnce();
  });

  it("samples on the interval and carries deltas", async () => {
    let rss = 100 * MB;
    const instance = telemetry(fakeSampler(() => memory(rss)));
    instance.start();
    await tick(0);
    rss = 130 * MB;
    await tick(30_000);

    const samples = instance.samples();
    expect(samples).toHaveLength(2);
    expect(samples[1]!.delta).toMatchObject({ s: 30, rss: 30 * MB });
    expect(samples[1]!.up).toBe(30);
    instance.stop();
  });

  it("counts events while running only", async () => {
    const bus = new EventBus();
    const instance = telemetry();
    instance.attachEventBus(bus);

    await bus.emit(ReactorEventTypes.JOB_WRITE_READY, {
      operations: [{}, {}],
    });
    instance.start();
    await bus.emit(ReactorEventTypes.JOB_WRITE_READY, {
      operations: [{}, {}, {}],
    });
    await bus.emit(ReactorEventTypes.JOB_FAILED, {});
    await instance.sampleNow();

    expect(instance.samples().at(-1)!.counters).toMatchObject({
      opsWritten: 3,
      jobsFailed: 1,
    });
    instance.stop();
  });

  it("reports a gauge that throws without stopping the tick", async () => {
    const instance = telemetry();
    instance.addGauge("good", () => ({ size: 3 }));
    instance.addGauge("bad", () => {
      throw new Error("boom");
    });
    instance.start();
    await tick(0);

    expect(instance.samples().at(-1)!.gauges).toMatchObject({
      good: { size: 3 },
      bad: { error: 1 },
    });
    instance.stop();
  });

  it("reads gauges registered from anywhere, until they unregister", async () => {
    const unregister = registerTelemetryGauge("plugin", () => ({ open: 2 }));
    const instance = telemetry();
    instance.start();
    await instance.sampleNow();
    expect(instance.samples().at(-1)!.gauges.plugin).toEqual({ open: 2 });

    unregister();
    await instance.sampleNow();
    expect(instance.samples().at(-1)!.gauges.plugin).toBeUndefined();
    instance.stop();
  });

  it("keeps a worker's last value, marked stale, when it does not answer", async () => {
    let answer = true;
    const unregister = registerTelemetryWorker("pglite:test", () =>
      answer
        ? Promise.resolve({ heapUsed: 5, wasm: 7 })
        : Promise.reject(new Error("busy")),
    );
    const instance = telemetry(fakeSampler(), {
      config: { workers: true, outputs: ["memory"] },
    });
    instance.start();
    await instance.sampleNow();
    answer = false;
    await instance.sampleNow();

    expect(instance.samples().at(-1)!.workers["pglite:test"]).toEqual({
      heapUsed: 5,
      wasm: 7,
      stale: true,
    });
    unregister();
    instance.stop();
  });

  it("opens the file on start and closes it on stop", async () => {
    const written: MemorySample[] = [];
    const sink: IMemoryTelemetrySink = {
      path: "/tmp/memory.jsonl",
      write: (s) => written.push(s),
      close: vi.fn(),
    };
    const instance = telemetry(fakeSampler(), {
      config: { workers: false, outputs: ["memory", "file"] },
      fileSink: () => sink,
    });
    instance.start();
    await tick(0);

    expect(written).toHaveLength(1);
    expect(instance.report().file).toBe("/tmp/memory.jsonl");
    instance.stop();
    expect(sink.close).toHaveBeenCalledOnce();
    expect(instance.report().file).toBeNull();
  });

  it("switches on a running reactor and keeps its samples", async () => {
    const instance = telemetry();
    instance.start();
    await tick(0);

    instance.reconfigure({ enabled: true, intervalMs: 5_000 });
    expect(instance.settings.intervalMs).toBe(5_000);
    await tick(5_000);
    expect(instance.samples().length).toBeGreaterThanOrEqual(2);

    instance.reconfigure({ enabled: false });
    expect(instance.running).toBe(false);
    expect(instance.report().enabled).toBe(false);
    expect(instance.samples().length).toBeGreaterThanOrEqual(2);
  });

  it("filters samples by limit and time", async () => {
    const instance = telemetry();
    instance.start();
    await tick(0);
    await tick(30_000);
    await tick(30_000);

    expect(instance.samples(1)).toHaveLength(1);
    const since = new Date(now - 30_000).toISOString();
    expect(instance.samples(undefined, since)).toHaveLength(2);
    instance.stop();
  });

  it("gives no summary before two samples, then the fastest gauges", async () => {
    let jobs = 0;
    const instance = telemetry();
    instance.addGauge("jobs", () => ({ size: (jobs += 10) }));
    instance.start();
    await tick(0);
    expect(instance.summary()).toBeNull();

    await tick(30_000);
    const summary = instance.summary()!;
    expect(summary.topGauges[0]?.gauge).toBe("jobs.size");
    expect(summary.windowMin).toBe(30);
    instance.stop();
  });

  it("samples around a heap snapshot, and refuses without a writer", async () => {
    const heapSnapshot = vi.fn(() => Promise.resolve("/tmp/heap"));
    const instance = telemetry(fakeSampler(), { heapSnapshot });
    instance.start();
    await tick(0);

    await expect(instance.writeHeapSnapshot(true)).resolves.toBe("/tmp/heap");
    expect(heapSnapshot).toHaveBeenCalledWith(true);
    expect(instance.samples()).toHaveLength(3);
    instance.stop();

    await expect(telemetry().writeHeapSnapshot(false)).rejects.toThrow(
      /cannot write heap snapshots/,
    );
  });

  it("refuses a sample while stopped", async () => {
    await expect(telemetry().sampleNow()).rejects.toThrow(/not running/);
  });
});
