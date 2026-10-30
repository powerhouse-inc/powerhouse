import type { ILogger } from "document-model";
import type { IEventBus } from "../events/interfaces.js";
import {
  resolveMemoryTelemetryConfig,
  MIN_MEMORY_TELEMETRY_INTERVAL_MS,
} from "./config.js";
import { deriveRates, gaugeGrowth, withinWindow } from "./correlation.js";
import { TelemetryCounters } from "./counters.js";
import { readGauges, readWorkers } from "./gauges.js";
import { Ring } from "./ring.js";
import type {
  GaugeReader,
  IMemorySampler,
  IMemoryTelemetrySink,
  MemoryCounters,
  MemorySample,
  MemoryTelemetryChange,
  MemoryTelemetryConfig,
  MemoryTelemetryReport,
  MemoryTelemetrySummary,
  WorkerMemorySample,
} from "./types.js";

const TOP_GAUGES = 3;
const WORKER_TIMEOUT_MS = 1_000;

export type MemoryTelemetryOptions = {
  sampler: IMemorySampler;
  config?: Partial<MemoryTelemetryConfig>;
  /** Opens the JSONL file when the `file` output starts. */
  fileSink?: (config: MemoryTelemetryConfig) => IMemoryTelemetrySink;
  /** Writes a heap snapshot and returns its path. */
  heapSnapshot?: (force: boolean) => Promise<string>;
  logger?: ILogger;
  /** Epoch ms; injectable for tests. */
  now?: () => number;
};

/**
 * Samples the process, its workers and the reactor's structures on an interval,
 * correlated with operations processed. A host builds one, the builder attaches
 * the module's gauges, and the host decides when it runs. Stopped, it holds no
 * timer, subscription or observer, so it costs nothing while off.
 */
export class MemoryTelemetry {
  private config: MemoryTelemetryConfig;
  private readonly sampler: IMemorySampler;
  private readonly fileSinkOf: MemoryTelemetryOptions["fileSink"];
  private readonly heapSnapshot: MemoryTelemetryOptions["heapSnapshot"];
  private readonly logger: ILogger | undefined;
  private readonly now: () => number;
  private readonly gauges = new Map<string, GaugeReader>();
  private counters = new TelemetryCounters(undefined);
  private ring: Ring<MemorySample>;
  private timer: ReturnType<typeof setInterval> | undefined;
  private sink: IMemoryTelemetrySink | undefined;
  private startedAt: number | undefined;
  private lastWorkers: Record<string, WorkerMemorySample> = {};
  private ticking = false;
  private stops: (() => void)[] = [];

  constructor(options: MemoryTelemetryOptions) {
    this.config = resolveMemoryTelemetryConfig(options.config);
    this.sampler = options.sampler;
    this.fileSinkOf = options.fileSink;
    this.heapSnapshot = options.heapSnapshot;
    this.logger = options.logger;
    this.now = options.now ?? (() => Date.now());
    this.ring = new Ring(this.config.ringSize);
  }

  get running(): boolean {
    return this.startedAt !== undefined;
  }

  get settings(): Readonly<MemoryTelemetryConfig> {
    return this.config;
  }

  /** The event bus operations are counted from. */
  attachEventBus(eventBus: IEventBus): void {
    this.counters = new TelemetryCounters(eventBus);
  }

  /** A gauge of this reactor, unlike the process-wide `registerTelemetryGauge`. */
  addGauge(name: string, read: GaugeReader): void {
    this.gauges.set(name, read);
  }

  /** Runs `stop` when telemetry stops, for a host's own output. */
  onStop(stop: () => void): void {
    this.stops.push(stop);
  }

  start(): void {
    if (this.running) return;
    this.startedAt = this.now();
    this.sampler.start();
    this.counters.start();
    if (this.config.outputs.includes("file") && this.fileSinkOf) {
      try {
        this.sink = this.fileSinkOf(this.config);
      } catch (error) {
        this.logger?.error(
          "Memory telemetry could not open its file: @Error",
          error,
        );
      }
    }
    this.startTimer();
  }

  stop(): void {
    if (!this.running) return;
    this.stopTimer();
    this.sink?.close();
    this.sink = undefined;
    this.counters.stop();
    this.sampler.stop();
    this.startedAt = undefined;
    this.lastWorkers = {};
    for (const stop of this.stops.splice(0)) stop();
  }

  /** Switches it, and changes the interval or outputs, without a restart. */
  reconfigure(change: MemoryTelemetryChange): void {
    const wasRunning = this.running;
    if (wasRunning) this.stop();
    this.config = resolveMemoryTelemetryConfig({
      ...this.config,
      enabled: change.enabled,
      intervalMs: change.intervalMs ?? this.config.intervalMs,
      outputs: change.outputs ?? this.config.outputs,
    });
    if (change.enabled) this.start();
  }

  /** Takes a sample now, also between ticks. Rejects while stopped. */
  async sampleNow(): Promise<MemorySample> {
    if (!this.running) {
      throw new Error("Memory telemetry is not running");
    }
    return this.collect();
  }

  /** Newest last, the latest `limit` at or after `sinceIso`. */
  samples(limit?: number, sinceIso?: string): MemorySample[] {
    const all = this.ring.toArray();
    const since = sinceIso === undefined ? undefined : Date.parse(sinceIso);
    const after =
      since === undefined || Number.isNaN(since)
        ? all
        : all.filter((sample) => Date.parse(sample.t) >= since);
    return limit === undefined ? after : after.slice(-Math.max(limit, 0));
  }

  /** Null until two samples exist. */
  summary(): MemoryTelemetrySummary | null {
    const window = withinWindow(this.ring.toArray(), this.config.windowMin);
    if (window.length < 2) return null;
    const gauges = gaugeGrowth(window);
    return {
      ...deriveRates(window, this.config.windowMin),
      topGauges: gauges.filter((g) => g.perMin > 0).slice(0, TOP_GAUGES),
      gauges,
    };
  }

  report(limit?: number, sinceIso?: string): MemoryTelemetryReport {
    const { startedAt } = this;
    return {
      enabled: this.running,
      intervalMs: this.config.intervalMs,
      consoleIntervalMs: this.config.consoleIntervalMs,
      outputs: [...this.config.outputs],
      file: this.sink?.path ?? null,
      startedAt:
        startedAt === undefined ? null : new Date(startedAt).toISOString(),
      summary: this.summary(),
      samples: this.samples(limit, sinceIso),
    };
  }

  /** A heap snapshot with a sample on each side; returns its path on the host. */
  async writeHeapSnapshot(force: boolean): Promise<string> {
    if (!this.heapSnapshot) {
      throw new Error("This host cannot write heap snapshots");
    }
    if (this.running) await this.collect();
    const path = await this.heapSnapshot(force);
    if (this.running) await this.collect();
    return path;
  }

  private startTimer(): void {
    const interval = Math.max(
      this.config.intervalMs,
      MIN_MEMORY_TELEMETRY_INTERVAL_MS,
    );
    this.timer = setInterval(() => void this.tick(), interval);
    (this.timer as { unref?: () => void }).unref?.();
    void this.tick();
  }

  private stopTimer(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  // A slow worker round-trip must not stack ticks.
  private async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      await this.collect();
    } catch (error) {
      this.logger?.error("Memory telemetry tick failed: @Error", error);
    } finally {
      this.ticking = false;
    }
  }

  private async collect(): Promise<MemorySample> {
    const memory = this.sampler.sample();
    const workers = this.config.workers
      ? this.withStale(await readWorkers(WORKER_TIMEOUT_MS))
      : {};
    const time = this.now();
    const previous = this.ring.last();
    const counters = this.counters.values;
    const sample: MemorySample = {
      t: new Date(time).toISOString(),
      up: (time - (this.startedAt ?? time)) / 1000,
      ...memory,
      workers,
      counters,
      delta: {
        s: previous ? (time - Date.parse(previous.t)) / 1000 : 0,
        opsWritten: opsSince(counters, previous),
        rss: previous ? memory.rss - previous.rss : 0,
        heapUsed: previous ? memory.heapUsed - previous.heapUsed : 0,
      },
      gauges: readGauges(this.gauges),
      derived: deriveRates([], this.config.windowMin),
    };
    const window = withinWindow(
      [...this.ring.toArray(), sample],
      this.config.windowMin,
    );
    sample.derived = deriveRates(window, this.config.windowMin);
    this.ring.push(sample);
    this.sink?.write(sample);
    return sample;
  }

  // A worker that did not answer keeps its last value, marked stale.
  private withStale(
    workers: Record<string, WorkerMemorySample | undefined>,
  ): Record<string, WorkerMemorySample> {
    const merged: Record<string, WorkerMemorySample> = {};
    for (const [name, sample] of Object.entries(workers)) {
      const last = this.lastWorkers[name];
      if (sample) merged[name] = sample;
      else if (last) merged[name] = { ...last, stale: true };
    }
    this.lastWorkers = merged;
    return merged;
  }
}

function opsSince(
  counters: MemoryCounters,
  previous: MemorySample | undefined,
): number {
  return previous
    ? counters.opsWritten - previous.counters.opsWritten
    : counters.opsWritten;
}
