// Identity, state and the actions for the workflow whose runs are shown:
// enable/disable, open the editor, delete. Stats come from the shared feed.
import {
  showDeleteNodeModal,
  useDispatch,
  useDocumentSafe,
} from "@powerhousedao/reactor-browser";
import type { FileNode } from "@powerhousedao/shared/document-drive";
import type { ReactNode } from "react";
import {
  actions as workflowActions,
  type WorkflowDocument,
} from "document-models/workflow";
import type { RunRecord } from "../../workflow-editor/runtime-api.js";
import { blockMeta } from "../../workflow-editor/ui/block-meta.js";
import { DocumentLoadError } from "../../shared/DocumentErrorBoundary.js";
import {
  formatAbsolute,
  formatWhen,
  RUN_DOT,
  RUN_TEXT,
  runStats,
  WORKFLOW_STATUS_STYLES,
} from "./run-format.js";
import { WorkflowSteps } from "./WorkflowSteps.js";

const WORKFLOW_TYPE = "powerhouse/workflow";

const ACTION =
  "rounded border border-solid border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-slate-400 hover:bg-slate-50";

function Stat(props: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 grow border-l border-solid border-slate-200 px-3 py-2 first:border-l-0 first:pl-0">
      <div className="text-[11px] text-slate-400">{props.label}</div>
      <div className="truncate text-xs text-slate-800">{props.children}</div>
    </div>
  );
}

export function WorkflowHeader(props: {
  node: FileNode;
  runs: RunRecord[] | null;
  onEdit: () => void;
}) {
  const workflowId = props.node.id;
  const { data: document, error, reload } = useDocumentSafe(workflowId);
  const [, dispatch] = useDispatch(document);

  if (error !== undefined) {
    return (
      <DocumentLoadError
        title="This workflow could not be loaded"
        documentId={workflowId}
        error={error}
        onRetry={() => {
          void reload();
        }}
      />
    );
  }
  if (document?.header.documentType !== WORKFLOW_TYPE) return null;

  const workflow = document as WorkflowDocument;
  const state = workflow.state.global;
  const enabled = state.status === "ENABLED";
  const stats = runStats(props.runs ?? []);
  const trigger = state.trigger
    ? blockMeta(state.trigger.blockType).displayName
    : null;

  return (
    <header className="mb-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="min-w-0 truncate text-base font-semibold text-slate-800">
          {state.name || props.node.name || "Untitled workflow"}
        </h2>
        <span
          className={`rounded px-2 py-0.5 text-[11px] font-semibold ${WORKFLOW_STATUS_STYLES[state.status] ?? "bg-slate-100 text-slate-500"}`}
        >
          {state.status}
        </span>
        <span className="grow" />
        <button
          type="button"
          className={ACTION}
          onClick={() =>
            dispatch(
              workflowActions.setWorkflowStatus({
                status: enabled ? "DISABLED" : "ENABLED",
              }),
            )
          }
        >
          {enabled ? "Disable" : "Enable"}
        </button>
        <button type="button" className={ACTION} onClick={props.onEdit}>
          Edit workflow
        </button>
        <button
          type="button"
          className="rounded border border-solid border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-600 hover:border-red-300 hover:bg-red-50"
          // The host modal confirms; the studio drops the target once the
          // node leaves the drive.
          onClick={() => showDeleteNodeModal(props.node)}
        >
          Delete
        </button>
      </div>
      {state.description ? (
        <p className="mt-1 max-w-2xl text-xs text-slate-500">
          {state.description}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-stretch rounded-md border border-solid border-slate-200 bg-white px-3">
        <Stat label="Trigger">
          {trigger ?? <span className="text-slate-400">None set</span>}
        </Stat>
        <Stat label="Last run">
          {stats.lastRun ? (
            <span
              className="flex items-center gap-1.5"
              title={formatAbsolute(stats.lastRun.startedAt)}
            >
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${RUN_DOT[stats.lastRun.status] ?? "bg-slate-300"}`}
              />
              <span className={RUN_TEXT[stats.lastRun.status] ?? ""}>
                {formatWhen(stats.lastRun.startedAt)}
              </span>
            </span>
          ) : (
            <span className="text-slate-400">Never run</span>
          )}
        </Stat>
        <Stat label="Recent runs">
          <span className="tabular-nums">
            {stats.total}
            {stats.failed > 0 ? (
              <span className="text-red-600"> · {stats.failed} failed</span>
            ) : null}
            {stats.running > 0 ? (
              <span className="text-amber-700"> · {stats.running} running</span>
            ) : null}
          </span>
        </Stat>
        <Stat label="Success rate">
          {stats.successRate === null ? (
            <span className="text-slate-400">—</span>
          ) : (
            <span className="tabular-nums">{stats.successRate}%</span>
          )}
        </Stat>
        <Stat label="Version">
          <span className="tabular-nums">v{state.version}</span>
        </Stat>
      </div>
      <WorkflowSteps
        state={state}
        latestRun={stats.lastRun}
        onOpenEditor={props.onEdit}
      />
    </header>
  );
}
