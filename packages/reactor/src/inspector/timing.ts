import type {
  ProcessorTimingCounters,
  ProcessorTimingHorizon,
  ProcessorTimingLevel,
  TrackedProcessor,
} from "@powerhousedao/shared/processors";
import type { CatchUpStatus } from "../catch-up/types.js";
import type {
  InspectorProcessorTiming,
  InspectorProcessorTimingReport,
} from "./types.js";

function ratePerSecond(amount: number, windowMs: number): number {
  return windowMs > 0 ? (amount * 1000) / windowMs : 0;
}

/**
 * One row per tracked processor, named and with its queue and lag even at
 * `off`; the head is the catch-up watermark, else the highest cursor. Times
 * are wall-clock milliseconds awaited, so read time under concurrent backfills
 * mostly means waiting on the store, not a slow query.
 */
export function computeProcessorTiming(
  processors: readonly TrackedProcessor[],
  catchUp: CatchUpStatus | undefined,
  level: ProcessorTimingLevel,
  windowMs: number,
): InspectorProcessorTimingReport {
  const headKnown = catchUp !== undefined;
  const head = headKnown
    ? catchUp.watermark.head
    : processors.reduce((top, p) => Math.max(top, p.lastOrdinal), 0);
  return {
    level,
    windowMs,
    head,
    headKnown,
    processors: processors.map((processor) => timingRow(processor, head)),
  };
}

function timingRow(
  processor: TrackedProcessor,
  head: number,
): InspectorProcessorTiming {
  const timing = processor.timing?.();
  const ordinalsBehind = Math.max(0, head - processor.lastOrdinal);
  const span = timing?.windowMs ?? 0;
  const window = timing?.window;
  const delivered = window
    ? window.live.opsDelivered + window.replay.opsDelivered
    : 0;
  const opsPerSecond = ratePerSecond(delivered, span);
  const ordinalsPerSecond = ratePerSecond(window?.ordinalsAdvanced ?? 0, span);
  return {
    processorId: processor.processorId,
    name: processor.name ?? `#${processor.processorIndex}`,
    driveLabel: processor.driveLabel ?? processor.driveId,
    factoryId: processor.factoryId,
    driveId: processor.driveId,
    phase: processor.phase,
    lastOrdinal: processor.lastOrdinal,
    queueDepth: processor.queueDepth?.() ?? { tasks: 0, ops: 0 },
    ordinalsBehind,
    opsPerSecond,
    ordinalsPerSecond,
    etaMs:
      processor.phase === "catching-up" && ordinalsPerSecond > 0
        ? (ordinalsBehind / ordinalsPerSecond) * 1000
        : null,
    sinceUtcMs: timing?.sinceUtcMs ?? null,
    total: timing?.total ?? null,
    window: window ?? null,
    windowMs: span,
    currentRun: timing?.currentRun ?? null,
    lastRun: timing?.lastRun ?? null,
    lastBatch: timing?.lastBatch ?? null,
    byDocumentType: timing?.byDocumentType ?? [],
  };
}

/** Which of a row's horizons to rank and show. */
export type TimingHorizonName = "window" | "total";

/** One line of the slowest list: a horizon's numbers over both paths. */
export type SlowProcessor = {
  label: string;
  busyMs: number;
  handlerMs: number;
  readMs: number;
  fillMs: number;
  opsPerSecond: number;
  ordinalsBehind: number;
  etaMs: number | null;
};

function sum(
  horizon: ProcessorTimingHorizon,
  field: keyof ProcessorTimingCounters,
): number {
  return horizon.live[field] + horizon.replay[field];
}

/** The `top` busiest processors of a horizon, busiest first; idle ones left out. */
export function rankSlowest(
  report: InspectorProcessorTimingReport,
  top: number,
  horizon: TimingHorizonName = "window",
): SlowProcessor[] {
  const rows: SlowProcessor[] = [];
  for (const row of report.processors) {
    const numbers = row[horizon];
    if (!numbers || numbers.busyMs <= 0) continue;
    rows.push({
      label: `${row.name} · ${row.driveLabel}`,
      busyMs: numbers.busyMs,
      handlerMs: sum(numbers, "handlerMs"),
      readMs: sum(numbers, "readMs"),
      fillMs: sum(numbers, "fillMs"),
      opsPerSecond: row.opsPerSecond,
      ordinalsBehind: row.ordinalsBehind,
      etaMs: row.etaMs,
    });
  }
  return rows.sort((a, b) => b.busyMs - a.busyMs).slice(0, Math.max(top, 0));
}

/** `4.1s`, `41s`, `2m10s`, `1h05m`. */
export function formatDuration(ms: number): string {
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m${String(seconds % 60).padStart(2, "0")}s`;
  }
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}m`;
}

/** `410`, `3.1k`, `12.4k`, `1.61M`. */
export function formatCount(value: number): string {
  if (value < 1000) return String(Math.round(value));
  if (value < 1_000_000) return `${(value / 1000).toFixed(1)}k`;
  return `${(value / 1_000_000).toFixed(2)}M`;
}

function slowEntry(row: SlowProcessor): string {
  const parts = [
    `${row.label.replace(" · ", "·")} ${formatDuration(row.busyMs)}`,
    `(handler ${formatDuration(row.handlerMs)} read ${formatDuration(row.readMs)} fill ${formatDuration(row.fillMs)})`,
    `${formatCount(row.opsPerSecond)} op/s`,
  ];
  if (row.etaMs !== null) parts.push(`eta ${formatDuration(row.etaMs)}`);
  return parts.join(" ");
}

/** The slowest list on one line, for a log. */
export function renderSlowLine(
  rows: readonly SlowProcessor[],
  windowMs: number,
): string {
  const seconds = Math.round(windowMs / 1000);
  return `catch-up slowest (${seconds} s): ${rows.map(slowEntry).join(" · ")}`;
}

/** One line when a catch-up ends, over the whole run rather than the window. */
export function renderDoneSummary(
  rows: readonly SlowProcessor[],
  wallMs: number,
): string {
  const entries = rows.map(
    (row) => `${row.label.replace(" · ", "·")} ${formatDuration(row.busyMs)}`,
  );
  const done = `catch-up done in ${formatDuration(wallMs)}`;
  return entries.length > 0
    ? `${done}; slowest since start: ${entries.join(" · ")}`
    : done;
}

/** True while any processor is replaying. */
export function isCatchingUp(report: InspectorProcessorTimingReport): boolean {
  return report.processors.some((row) => row.phase === "catching-up");
}
