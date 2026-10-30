/** Where samples go besides the ring, which is always on while telemetry runs. */
export type MemoryTelemetryOutput = "memory" | "file" | "console";

export type MemoryTelemetryConfig = {
  enabled: boolean;
  intervalMs: number;
  outputs: MemoryTelemetryOutput[];
  /** Explicit JSONL path; absent names a file under `<phDir>/telemetry`. */
  filePath: string | undefined;
  fileMaxMb: number;
  fileKeep: number;
  ringSize: number;
  consoleIntervalMs: number;
  /** Include worker isolates and PGlite WASM. */
  workers: boolean;
  /** The correlation window. */
  windowMin: number;
};

/** Numbers a structure reports about itself; read synchronously at each tick. */
export type GaugeValues = Record<string, number>;

export type GaugeReader = () => GaugeValues;

/** One worker isolate's memory. */
export type WorkerMemorySample = {
  heapUsed: number;
  /** PGlite: WASM linear memory, which only grows. */
  wasm?: number;
  /** PGlite: the previous value, because the worker did not answer in time. */
  stale?: boolean;
};

export type WorkerMemoryReader = () => Promise<WorkerMemorySample>;

/** What the process-level sampler reports; all sizes in bytes. */
export type ProcessMemorySample = {
  rss: number;
  /** Peak resident size. */
  maxRss: number;
  heapUsed: number;
  heapTotal: number;
  heapLimit: number;
  external: number;
  arrayBuffers: number;
  mallocedMemory: number;
  /** Used heap right after the last major GC: the leak signal. */
  postGcHeap: number | null;
  postGcAt: string | null;
  spaces: { old: number; lo: number; code: number; new: number };
  contexts: { native: number; detached: number };
  /** Event-loop delay percentiles in ms. */
  loop: { p50: number; p99: number };
  freemem: number;
};

/**
 * Node's half of the telemetry, injected so the core stays free of Node
 * imports. Holds nothing until `start` and nothing after `stop`.
 */
export interface IMemorySampler {
  start(): void;
  stop(): void;
  sample(): ProcessMemorySample;
}

/** Receives every sample; closed when telemetry stops. */
export interface IMemoryTelemetrySink {
  /** Where it writes, reported on the inspection surface. */
  readonly path: string;
  write(sample: MemorySample): void;
  close(): void;
}

/** Cumulative since telemetry started. */
export type MemoryCounters = {
  jobsEnqueued: number;
  jobsReadReady: number;
  jobsFailed: number;
  opsWritten: number;
  readModelBatches: number;
  readModelOps: number;
  catchUpSweeps: number;
};

export type MemoryVerdict = "steady" | "growing" | "growing-without-ops";

/** A gauge's growth over the window. */
export type GaugeGrowth = {
  gauge: string;
  value: number;
  /** Entries per minute. */
  perMin: number;
  /** Correlation with post-GC heap growth, when both moved. */
  r: number | null;
};

/** Rates over the sliding window; slopes in MB per minute. */
export type MemoryDerived = {
  windowMin: number;
  /** Only when the window wrote at least 1000 operations. */
  mbPer1kOps: number | null;
  postGcMbPer1kOps: number | null;
  rssMbPerMin: number;
  heapMbPerMin: number;
  postGcMbPerMin: number | null;
  externalMbPerMin: number;
  pgliteMbPerMin: number;
  verdict: MemoryVerdict;
};

/** One tick; flat and about 1-2 KB, so the ring stays small. */
export type MemorySample = ProcessMemorySample & {
  t: string;
  /** Seconds since telemetry started. */
  up: number;
  /** Absent when the tick did not read workers. */
  workers: Record<string, WorkerMemorySample>;
  counters: MemoryCounters;
  delta: { s: number; opsWritten: number; rss: number; heapUsed: number };
  gauges: Record<string, GaugeValues>;
  derived: MemoryDerived;
};

export type MemoryTelemetrySummary = MemoryDerived & {
  /** The gauges growing fastest, a hint at which snapshot to take. */
  topGauges: GaugeGrowth[];
  /** Every gauge's growth, fastest first. */
  gauges: GaugeGrowth[];
};

/** What the inspection surface serves. */
export type MemoryTelemetryReport = {
  enabled: boolean;
  intervalMs: number;
  consoleIntervalMs: number;
  outputs: MemoryTelemetryOutput[];
  /** The current JSONL path, when the file output is on. */
  file: string | null;
  startedAt: string | null;
  /** Null until two samples exist. */
  summary: MemoryTelemetrySummary | null;
  /** Newest last. */
  samples: MemorySample[];
};

/** What can change on a running reactor. */
export type MemoryTelemetryChange = {
  enabled: boolean;
  intervalMs?: number;
  outputs?: MemoryTelemetryOutput[];
};
