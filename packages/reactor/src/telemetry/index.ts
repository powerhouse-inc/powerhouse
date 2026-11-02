export {
  DEFAULT_MEMORY_TELEMETRY_CONFIG,
  isMemoryTelemetryOutput,
  MEMORY_TELEMETRY_OUTPUTS,
  MIN_MEMORY_TELEMETRY_INTERVAL_MS,
  parseMemoryTelemetryOutputs,
  parseMemoryTelemetrySwitch,
  resolveMemoryTelemetryConfig,
} from "./config.js";
export { correlation, deriveRates, gaugeGrowth, slope } from "./correlation.js";
export { registerTelemetryGauge, registerTelemetryWorker } from "./gauges.js";
export {
  MemoryTelemetry,
  type MemoryTelemetryOptions,
} from "./memory-telemetry.js";
export { Ring } from "./ring.js";
export type {
  GaugeGrowth,
  GaugeReader,
  GaugeValues,
  IMemorySampler,
  IMemoryTelemetrySink,
  MemoryCounters,
  MemoryDerived,
  MemorySample,
  MemoryTelemetryChange,
  MemoryTelemetryConfig,
  MemoryTelemetryOutput,
  MemoryTelemetryReport,
  MemoryTelemetrySummary,
  MemoryVerdict,
  ProcessMemorySample,
  WorkerMemoryReader,
  WorkerMemorySample,
} from "./types.js";
