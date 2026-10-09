// Pruning of the run journal. ON by default: finished runs older than the
// window go with their step executions and run documents.
//
// It used to be opt-in, which meant unbounded growth for every host that did
// not know to set the variable — measured at 743MB in three days on distyra
// (multi-reactor plan, backlog item 7). A journal is diagnostic, so a default
// window is the honest setting and "keep everything" is the choice an operator
// makes deliberately. `STEP_PAYLOAD_MAX_BYTES` bounds row WIDTH; this bounds
// row COUNT, and the two belong together.
import type { WorkflowRunStore } from "./store.js";

export const RUN_RETENTION_ENV = "PH_WORKFLOWS_RUN_RETENTION_DAYS";
export const RETENTION_SWEEP_INTERVAL_MS = 60 * 60_000;
const DAY_MS = 24 * 60 * 60_000;

/** How long a finished run is kept when nothing says otherwise. */
export const DEFAULT_RUN_RETENTION_DAYS = 30;

/** The spellings that turn retention OFF, compared case-insensitively after
 * trimming. Wider than `0` because "off" and "never" are what an operator
 * reaches for, and a variable that silently keeps pruning because they wrote
 * one of those is the worst outcome available. */
export const RETENTION_OFF_SPELLINGS: readonly string[] = [
  "0",
  "off",
  "never",
  "false",
  "none",
];

/**
 * The retention window, or undefined when an operator turned it off.
 *
 * Unset means the default. An unparseable value also means the default rather
 * than silently disabling: the variable's purpose is a bound, and a typo must
 * not remove one.
 */
export function runRetentionMs(
  env: Record<string, string | undefined> = process.env,
): number | undefined {
  const raw = env[RUN_RETENTION_ENV]?.trim();
  if (
    raw !== undefined &&
    RETENTION_OFF_SPELLINGS.includes(raw.toLowerCase())
  ) {
    return undefined;
  }
  const days = Number(raw);
  return (days > 0 ? days : DEFAULT_RUN_RETENTION_DAYS) * DAY_MS;
}

export interface RetentionSweep {
  runs: number;
  dedupeKeys: number;
}

// `dedupeTtlMs` is the longest TTL any claim uses; older keys are inert.
export async function sweepRetention(
  store: WorkflowRunStore,
  options: { retentionMs: number; dedupeTtlMs: number; now?: Date },
): Promise<RetentionSweep> {
  const now = (options.now ?? new Date()).getTime();
  const runs = await store.pruneFinishedRuns(
    new Date(now - options.retentionMs).toISOString(),
  );
  const dedupeKeys = await store.pruneDedupe(
    new Date(now - options.dedupeTtlMs).toISOString(),
  );
  return { runs, dedupeKeys };
}
