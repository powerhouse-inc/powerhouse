// Shared run vocabulary: one set of formatters and status colours so the
// header, the table and the editor toolbar never disagree about a run.
import type { RunRecord } from "../../workflow-editor/runtime-api.js";

export const RUN_STATUSES = ["RUNNING", "SUCCEEDED", "FAILED"] as const;

// Status is the only place colour carries meaning in this view.
export const RUN_DOT: Record<string, string> = {
  SUCCEEDED: "bg-green-500",
  FAILED: "bg-red-500",
  RUNNING: "bg-amber-400",
  PARKED: "bg-slate-400",
  CANCELLED: "bg-slate-400",
};

export const RUN_TEXT: Record<string, string> = {
  SUCCEEDED: "text-green-700",
  FAILED: "text-red-700",
  RUNNING: "text-amber-700",
};

export const STEP_TEXT: Record<string, string> = {
  SUCCEEDED: "text-green-600",
  FAILED: "text-red-600",
  SKIPPED: "text-slate-400",
  REPLAYED: "text-sky-600",
};

// Sidebar dots: the same status vocabulary at glyph size.
export const WORKFLOW_STATUS_DOT: Record<string, string> = {
  ENABLED: "bg-green-500",
  DRAFT: "bg-slate-300",
  DISABLED: "bg-amber-400",
  ARCHIVED: "bg-slate-200",
};

export const CONNECTION_STATUS_DOT: Record<string, string> = {
  OK: "bg-green-500",
  ERROR: "bg-red-500",
  REVOKED: "bg-red-400",
  UNCONFIGURED: "bg-slate-300",
};

export const WORKFLOW_STATUS_STYLES: Record<string, string> = {
  ENABLED: "bg-green-100 text-green-700",
  DRAFT: "bg-slate-100 text-slate-500",
  DISABLED: "bg-amber-100 text-amber-700",
  ARCHIVED: "bg-slate-200 text-slate-400",
};

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
