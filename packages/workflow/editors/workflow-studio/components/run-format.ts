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
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
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
