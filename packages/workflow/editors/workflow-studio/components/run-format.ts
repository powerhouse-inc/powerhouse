// Shared run vocabulary: one set of formatters and status colours so the
// header, the table and the editor toolbar never disagree about a run.
import type { RunRecord } from "../../workflow-editor/runtime-api.js";

export const RUN_STATUSES = ["RUNNING", "SUCCEEDED", "FAILED"] as const;

// Every status maps to one of five tones; colour carries meaning nowhere else.
export type Tone = "ok" | "fail" | "warn" | "run" | "idle";

export const TONE_TEXT: Record<Tone, string> = {
  ok: "text-wf-ok",
  fail: "text-wf-fail",
  warn: "text-wf-warn",
  run: "text-wf-run",
  idle: "text-muted-foreground",
};

export const TONE_DOT: Record<Tone, string> = {
  ok: "bg-wf-ok",
  fail: "bg-wf-fail",
  warn: "bg-wf-warn",
  run: "bg-wf-run",
  idle: "bg-muted-foreground/40",
};

export const TONE_BADGE: Record<Tone, string> = {
  ok: "bg-wf-ok/12 text-wf-ok",
  fail: "bg-wf-fail/12 text-wf-fail",
  warn: "bg-wf-warn/12 text-wf-warn",
  run: "bg-wf-run/12 text-wf-run",
  idle: "bg-muted text-muted-foreground",
};

export const RUN_TONE: Record<string, Tone> = {
  SUCCEEDED: "ok",
  FAILED: "fail",
  RUNNING: "run",
  WAITING: "run",
  PENDING: "idle",
  PARKED: "warn",
  CANCELLED: "idle",
};

export const STEP_TONE: Record<string, Tone> = {
  ...RUN_TONE,
  SKIPPED: "idle",
  REPLAYED: "run",
};

export const WORKFLOW_TONE: Record<string, Tone> = {
  ENABLED: "ok",
  DRAFT: "idle",
  DISABLED: "warn",
  ARCHIVED: "idle",
};

// A workflow's dot: how its last run went while it's enabled, hollow while
// it's a draft, paused, or has never run.
export function workflowHealth(
  status: string | undefined,
  lastRunStatus: string | undefined,
): { tone: Tone; label: string } {
  const state = statusLabel(status ?? "DRAFT");
  if (status !== "ENABLED") return { tone: "idle", label: state };
  if (!lastRunStatus) return { tone: "idle", label: `${state}, not run yet` };
  return {
    tone: toneOf(RUN_TONE, lastRunStatus),
    label: `${state}, last run ${statusLabel(lastRunStatus).toLowerCase()}`,
  };
}

export const CONNECTION_TONE: Record<string, Tone> = {
  OK: "ok",
  ERROR: "fail",
  REVOKED: "fail",
  UNCONFIGURED: "warn",
};

export function toneOf(map: Record<string, Tone>, status?: string): Tone {
  const tone = status ? (map[status] as Tone | undefined) : undefined;
  return tone ?? "idle";
}

// FAILED → Failed; stored enums read as words, not tokens.
export function statusLabel(status: string): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export function formatDuration(
  startedAt: string,
  endedAt: string | null,
): string {
  if (!endedAt) return "…";
  return formatMs(new Date(endedAt).getTime() - new Date(startedAt).getTime());
}

export interface TimelineSpan {
  // Fractions of the run's length, for positioning a bar.
  offset: number;
  width: number;
  ms: number;
}

// Where each timed step sat within its run; untimed steps (skipped, replayed,
// journaled before timings) get no span.
export function runTimeline(run: {
  startedAt: string;
  endedAt: string | null;
  steps: { stepId: string; startedAt: string | null; endedAt: string | null }[];
}): Map<string, TimelineSpan> {
  const start = new Date(run.startedAt).getTime();
  const ends = run.steps
    .map((step) => (step.endedAt ? new Date(step.endedAt).getTime() : 0))
    .concat(run.endedAt ? new Date(run.endedAt).getTime() : 0);
  const total = Math.max(...ends) - start;
  const spans = new Map<string, TimelineSpan>();
  if (total <= 0) return spans;
  for (const step of run.steps) {
    if (!step.startedAt || !step.endedAt) continue;
    const from = new Date(step.startedAt).getTime() - start;
    const ms =
      new Date(step.endedAt).getTime() - new Date(step.startedAt).getTime();
    spans.set(step.stepId, {
      offset: Math.min(Math.max(from / total, 0), 1),
      width: Math.min(Math.max(ms / total, 0), 1),
      ms,
    });
  }
  return spans;
}

// Rounds before splitting units, so 59.96s reads "1m 0s" rather than "60.0s".
export function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const tenths = Math.round(ms / 100);
  if (tenths < 600) return `${(tenths / 10).toFixed(1)}s`;
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function durationMs(
  startedAt: string,
  endedAt: string | null,
): number | null {
  if (!endedAt) return null;
  return new Date(endedAt).getTime() - new Date(startedAt).getTime();
}

export function formatWhen(startedAt: string): string {
  const diff = Date.now() - new Date(startedAt).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(startedAt).toLocaleDateString();
}

export function formatAbsolute(iso: string): string {
  return new Date(iso).toLocaleString();
}

// A trigger kind reads better as a verb phrase than as its stored token.
export function formatTrigger(kind: string): string {
  return kind.replace(/[-_]/g, " ").toLowerCase();
}

export interface RunStats {
  total: number;
  succeeded: number;
  failed: number;
  running: number;
  lastRun?: RunRecord;
  // Null until at least one run has finished.
  successRate: number | null;
}

export function runStats(runs: RunRecord[]): RunStats {
  const succeeded = runs.filter((run) => run.status === "SUCCEEDED").length;
  const failed = runs.filter((run) => run.status === "FAILED").length;
  const finished = succeeded + failed;
  return {
    total: runs.length,
    succeeded,
    failed,
    running: runs.filter((run) => run.status === "RUNNING").length,
    // Runs arrive newest first.
    lastRun: runs[0],
    successRate:
      finished === 0 ? null : Math.round((succeeded / finished) * 100),
  };
}
