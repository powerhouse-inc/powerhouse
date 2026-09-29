// Opt-in pruning of the run journal. Off unless PH_WORKFLOWS_RUN_RETENTION_DAYS
// is a positive number; finished runs older than that go with their children.
import type { WorkflowRunStore } from "./store.js";

export const RUN_RETENTION_ENV = "PH_WORKFLOWS_RUN_RETENTION_DAYS";
export const RETENTION_SWEEP_INTERVAL_MS = 60 * 60_000;
const DAY_MS = 24 * 60 * 60_000;

// Undefined means retention is off.
export function runRetentionMs(
  env: Record<string, string | undefined> = process.env,
): number | undefined {
  const days = Number(env[RUN_RETENTION_ENV]);
  return days > 0 ? days * DAY_MS : undefined;
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
