import type {
  GaugeGrowth,
  MemorySample,
  MemoryTelemetryReport,
} from "@powerhousedao/reactor";

const MB = 1024 * 1024;

function size(bytes: number): string {
  return bytes >= 1024 * MB
    ? `${(bytes / (1024 * MB)).toFixed(2)} GB`
    : `${Math.round(bytes / MB)} MB`;
}

function rate(mbPerMin: number | null): string {
  if (mbPerMin === null) return "";
  const rounded = Math.round(mbPerMin);
  return ` (${rounded >= 0 ? "+" : ""}${rounded} MB/min)`;
}

function growth(gauge: GaugeGrowth): string {
  const perMin = Math.round(gauge.perMin);
  const text =
    Math.abs(perMin) >= 1000 ? `${(perMin / 1000).toFixed(1)}k` : `${perMin}`;
  return `${gauge.gauge} ${perMin >= 0 ? "+" : ""}${text}/min`;
}

function pglite(sample: MemorySample): number {
  let total = 0;
  for (const worker of Object.values(sample.workers)) total += worker.wasm ?? 0;
  return total;
}

/** The newest sample on one line; undefined before there is one. */
export function renderMemoryLine(
  report: MemoryTelemetryReport,
): string | undefined {
  const sample = report.samples.at(-1);
  if (!sample) return undefined;
  const { summary } = report;
  const heap =
    sample.postGcHeap === null
      ? `heap ${size(sample.heapUsed)}`
      : `heap ${size(sample.heapUsed)}, post-GC ${size(sample.postGcHeap)}${rate(summary?.postGcMbPerMin ?? null)}`;
  const seconds = Math.round(sample.delta.s);
  const perOps =
    summary?.mbPer1kOps === null || summary?.mbPer1kOps === undefined
      ? ""
      : `, ${Math.round(summary.mbPer1kOps)} MB/1k ops`;
  const parts = [
    `memory: rss ${size(sample.rss)}${rate(summary?.rssMbPerMin ?? null)}`,
    heap,
  ];
  const wasm = pglite(sample);
  if (wasm > 0) parts.push(`pglite ${size(wasm)}`);
  parts.push(`${sample.delta.opsWritten} ops/${seconds}s${perOps}`);
  const top = summary?.topGauges[0];
  if (top) parts.push(`top: ${growth(top)}`);
  return parts.join(" · ");
}

/** True when the reactor is running telemetry with the console output on. */
export function wantsMemoryLine(report: MemoryTelemetryReport): boolean {
  return report.enabled && report.outputs.includes("console");
}
