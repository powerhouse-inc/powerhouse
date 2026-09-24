// Identity, state and the actions for the workflow whose runs are shown:
// enable/disable, open the editor, delete. Stats come from the shared feed.
import {
  showDeleteNodeModal,
  useDispatch,
  useDocumentSafe,
} from "@powerhousedao/reactor-browser";
import type { FileNode } from "@powerhousedao/shared/document-drive";
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
  RUN_TONE,
  runStats,
  toneOf,
  TONE_BADGE,
  TONE_TEXT,
  statusLabel,
  WORKFLOW_TONE,
} from "./run-format.js";
import { Button, Fact, StatusDot } from "./ui.js";
import { WorkflowSteps } from "./WorkflowSteps.js";

const WORKFLOW_TYPE = "powerhouse/workflow";

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

  const lastTone = toneOf(RUN_TONE, stats.lastRun?.status);
  const statusTone = toneOf(WORKFLOW_TONE, state.status);

  return (
    <header className="mb-8">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 grow">
          <div className="flex items-center gap-2.5">
            <h2 className="min-w-0 truncate text-xl font-semibold tracking-tight text-foreground">
              {state.name || props.node.name || "Untitled workflow"}
            </h2>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${TONE_BADGE[statusTone]}`}
            >
              {statusLabel(state.status)}
            </span>
          </div>
          {state.description ? (
            <p className="mt-1 max-w-prose text-[13px] text-muted-foreground">
              {state.description}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="danger"
            onClick={() => showDeleteNodeModal(props.node)}
          >
            Delete
          </Button>
          <Button
            onClick={() =>
              dispatch(
                workflowActions.setWorkflowStatus({
                  status: enabled ? "DISABLED" : "ENABLED",
                }),
              )
            }
          >
            {enabled ? "Disable" : "Enable"}
          </Button>
          <Button variant="primary" onClick={props.onEdit}>
            Edit workflow
          </Button>
        </div>
      </div>
      <dl className="mt-5 flex flex-wrap gap-x-10 gap-y-3">
        <Fact label="Trigger">
          {trigger ?? <span className="text-muted-foreground">None set</span>}
        </Fact>
        <Fact
          label="Last run"
          title={
            stats.lastRun ? formatAbsolute(stats.lastRun.startedAt) : undefined
          }
        >
          {stats.lastRun ? (
            <span
              className={`inline-flex items-center gap-1.5 ${TONE_TEXT[lastTone]}`}
            >
              <StatusDot tone={lastTone} />
              {formatWhen(stats.lastRun.startedAt)}
            </span>
          ) : (
            <span className="text-muted-foreground">Never</span>
          )}
        </Fact>
        <Fact label="Runs">
          {stats.total}
          {stats.failed > 0 ? (
            <span className="text-wf-fail"> ({stats.failed} failed)</span>
          ) : null}
        </Fact>
        <Fact label="Success rate">
          {stats.successRate === null ? (
            <span className="text-muted-foreground">No finished runs</span>
          ) : (
            `${stats.successRate}%`
          )}
        </Fact>
        <Fact label="Version">v{state.version}</Fact>
      </dl>
      <WorkflowSteps
        state={state}
        latestRun={stats.lastRun}
        onOpenEditor={props.onEdit}
      />
    </header>
  );
}
