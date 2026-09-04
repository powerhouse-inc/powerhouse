// The bar above an open document editor: the way back to the journal, plus
// the run facts an author wants while editing.
import { useDocumentSafe } from "@powerhousedao/reactor-browser";
import type { FileNode } from "@powerhousedao/shared/document-drive";
import type { WorkflowDocument } from "document-models/workflow";
import type { RunRecord } from "../../workflow-editor/runtime-api.js";
import {
  formatAbsolute,
  formatDuration,
  formatWhen,
  RUN_DOT,
  RUN_TEXT,
  runStats,
  WORKFLOW_STATUS_STYLES,
} from "./run-format.js";

const WORKFLOW_TYPE = "powerhouse/workflow";

function Fact(props: { label: string; value: string; title?: string }) {
  return (
    <span className="flex items-baseline gap-1.5" title={props.title}>
      <span className="text-[11px] text-slate-400">{props.label}</span>
      <span className="text-xs tabular-nums text-slate-700">{props.value}</span>
    </span>
  );
}

export function EditorToolbar(props: {
  node?: FileNode;
  runs: RunRecord[] | null;
  onBack: () => void;
}) {
  const { data: document } = useDocumentSafe(props.node?.id ?? null);
  const isWorkflow = document?.header.documentType === WORKFLOW_TYPE;
  const state = isWorkflow
    ? (document as WorkflowDocument).state.global
    : undefined;
  const stats = runStats(props.runs ?? []);
  const lastRun = isWorkflow ? stats.lastRun : undefined;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-solid border-slate-200 bg-slate-50 px-3 py-2">
      <button
        type="button"
        className="flex items-center gap-1.5 rounded border border-solid border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:border-slate-400 hover:text-slate-900"
        onClick={props.onBack}
      >
        <span aria-hidden>←</span>
        {isWorkflow ? "Back to runs" : "Back to overview"}
      </button>
      <span className="min-w-0 truncate text-sm font-medium text-slate-800">
        {state?.name || props.node?.name || "Untitled"}
      </span>
      {state ? (
        <span
          className={`rounded px-2 py-0.5 text-[11px] font-semibold ${WORKFLOW_STATUS_STYLES[state.status] ?? "bg-slate-100 text-slate-500"}`}
        >
          {state.status}
        </span>
      ) : null}
      {isWorkflow ? (
        <span className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1">
          {lastRun ? (
            <span
              className="flex items-baseline gap-1.5"
              title={formatAbsolute(lastRun.startedAt)}
            >
              <span className="text-[11px] text-slate-400">Last run</span>
              <span className="flex items-center gap-1.5 text-xs">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${RUN_DOT[lastRun.status] ?? "bg-slate-300"}`}
                />
                <span className={RUN_TEXT[lastRun.status] ?? "text-slate-700"}>
                  {formatWhen(lastRun.startedAt)}
                </span>
                <span className="tabular-nums text-slate-400">
                  {formatDuration(lastRun.startedAt, lastRun.endedAt)}
                </span>
              </span>
            </span>
          ) : (
            <Fact label="Last run" value="Never run" />
          )}
          {stats.successRate !== null ? (
            <Fact
              label="Success"
              value={`${stats.successRate}%`}
              title={`${stats.succeeded} of ${stats.succeeded + stats.failed} finished runs succeeded`}
            />
          ) : null}
          <Fact label="Runs" value={String(stats.total)} />
        </span>
      ) : null}
    </div>
  );
}
