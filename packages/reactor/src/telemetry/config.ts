import type { MemoryTelemetryConfig, MemoryTelemetryOutput } from "./types.js";

export const MEMORY_TELEMETRY_OUTPUTS: readonly MemoryTelemetryOutput[] = [
  "memory",
  "file",
  "console",
];

export const MIN_MEMORY_TELEMETRY_INTERVAL_MS = 1_000;

export const DEFAULT_MEMORY_TELEMETRY_CONFIG: Readonly<MemoryTelemetryConfig> =
  Object.freeze({
    enabled: false,
    intervalMs: 30_000,
    outputs: ["memory", "file"] as MemoryTelemetryOutput[],
    filePath: undefined,
    fileMaxMb: 10,
    fileKeep: 5,
    ringSize: 720,
    consoleIntervalMs: 300_000,
    workers: true,
    windowMin: 30,
  });

export function isMemoryTelemetryOutput(
  value: string,
): value is MemoryTelemetryOutput {
  return (MEMORY_TELEMETRY_OUTPUTS as readonly string[]).includes(value);
}

/**
 * The outputs of a comma list; `memory` is implied. Undefined when any entry is
 * unknown, so a caller can warn and keep its default.
 */
export function parseMemoryTelemetryOutputs(
  raw: string,
): MemoryTelemetryOutput[] | undefined {
  const outputs = new Set<MemoryTelemetryOutput>(["memory"]);
  for (const entry of raw.split(",")) {
    const output = entry.trim();
    if (output.length === 0) continue;
    if (!isMemoryTelemetryOutput(output)) return undefined;
    outputs.add(output);
  }
  return [...outputs];
}

/** `on`/`off`, also `true`/`false` and `1`/`0`; undefined for anything else. */
export function parseMemoryTelemetrySwitch(raw: string): boolean | undefined {
  const value = raw.trim().toLowerCase();
  if (value === "on" || value === "true" || value === "1") return true;
  if (value === "off" || value === "false" || value === "0") return false;
  return undefined;
}

/** Defaults filled in, the interval held at its minimum, `memory` always kept. */
export function resolveMemoryTelemetryConfig(
  partial: Partial<MemoryTelemetryConfig> = {},
): MemoryTelemetryConfig {
  const config = { ...DEFAULT_MEMORY_TELEMETRY_CONFIG, ...partial };
  return {
    ...config,
    intervalMs: Math.max(config.intervalMs, MIN_MEMORY_TELEMETRY_INTERVAL_MS),
    outputs: [...new Set<MemoryTelemetryOutput>(["memory", ...config.outputs])],
  };
}
