// Identity, state and the actions for the workflow whose runs are shown:
// on/off, open the editor, and archive or delete behind the "…" menu. Stats come from the shared feed.
import { useDispatch, useDocumentSafe } from "@powerhousedao/reactor-browser";
import type { FileNode } from "@powerhousedao/shared/document-drive";
import {
  actions as workflowActions,
  type WorkflowDocument,
} from "document-models/workflow";
import type { RunRecord } from "../../workflow-editor/runtime-client.js";
import { DocumentLoadError } from "../../shared/DocumentErrorBoundary.js";
import {
  formatAbsolute,
  formatWhen,
  RUN_TONE,
  runStats,
  toneOf,
  TONE_TEXT,
} from "./run-format.js";
import { Button, Fact, StatusDot } from "./ui.js";
import {
  PublishState,
  StatusToggle,
} from "../../workflow-editor/ui/PublishControls.js";
import { WorkflowMenu } from "./WorkflowMenu.js";
import { describeTrigger } from "../../workflow-editor/ui/trigger-text.js";
import { RunStrip } from "./chain.js";
import { WorkflowSteps } from "./WorkflowSteps.js";

const WORKFLOW_TYPE = "powerhouse/workflow";

export function WorkflowHeader(props: {
  node: FileNode;
  runs: RunRecord[] | null;
  onEdit: () => void;
  onDeleted?: () => void;
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
  const stats = runStats(props.runs ?? []);

  const lastTone = toneOf(RUN_TONE, stats.lastRun?.status);

  return (
    <header className="mb-8">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 grow">
          <div className="flex items-center gap-2.5">
            <h2 className="min-w-0 truncate text-xl font-semibold tracking-tight text-foreground">
              {state.name || props.node.name || "Untitled workflow"}
            </h2>
            <PublishState model={state} />
            {state.status === "ARCHIVED" ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                Archived
              </span>
            ) : null}
          </div>
          {state.description ? (
            <p className="mt-1 max-w-prose text-[13px] text-muted-foreground">
              {state.description}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <StatusToggle
            published={Boolean(state.published)}
            status={state.status}
            onChange={(status) =>
              dispatch(workflowActions.setWorkflowStatus({ status }))
            }
          />
          <Button variant="primary" onClick={props.onEdit}>
            Edit workflow
          </Button>
          <WorkflowMenu
            document={workflow}
            nodeName={props.node.name}
            onDeleted={props.onDeleted}
          />
        </div>
      </div>
      <dl className="mt-5 flex flex-wrap gap-x-10 gap-y-3">
        <Fact label="Starts">
          {state.trigger ? (
            describeTrigger(state.trigger)
          ) : (
            <span className="text-wf-warn">Never: no trigger</span>
          )}
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
        <Fact label="Recent runs">
          {stats.total > 0 ? (
            <RunStrip runs={props.runs ?? []} />
          ) : (
            <span className="text-muted-foreground">None yet</span>
          )}
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
