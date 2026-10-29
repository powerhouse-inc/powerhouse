// Workflow Studio: drive app listing workflows and connections with a
// GitHub-Actions-style run journal; opens the per-document editors inline.
import {
  addDocument,
  addFolder,
  deleteNode,
  useDocumentSafe,
  useFileNodesInSelectedDrive,
  useNodesInSelectedDrive,
  usePHToast,
  useSelectedDrive,
  useSelectedNode,
} from "@powerhousedao/reactor-browser";
import type { FileNode } from "@powerhousedao/shared/document-drive";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  useWorkflowDocumentsInSelectedDrive,
  type WorkflowDocument,
} from "document-models/workflow";
import {
  MANUAL_TRIGGER,
  sameBlock,
  triggerBlock,
} from "../../workflow-editor/ui/blocks.js";
import {
  useRuntimeActions,
  WorkflowRuntimeProvider,
} from "../../workflow-editor/runtime-context.js";
import { parseManualInputs } from "../../workflow-editor/ui/manual-inputs.js";
import { DocumentErrorBoundary } from "../../shared/DocumentErrorBoundary.js";
import { RunsView } from "./RunsView.js";
import { usePendingApprovals, WaitingApprovals } from "./Waitpoints.js";
import { Sidebar } from "./Sidebar.js";
import { useItemSelection } from "./use-item-selection.js";
import { useRuns } from "./useRuns.js";
import { WorkflowBoard } from "./WorkflowBoard.js";
import { WorkflowHeader } from "./WorkflowHeader.js";
import {
  homeFolderName,
  nextKey,
  orderWorkflows,
  reorderActions,
} from "./workflow-order.js";

const WORKFLOW_TYPE = "powerhouse/workflow";
const CONNECTION_TYPE = "powerhouse/connection";

export function WorkflowStudio(props: { children?: ReactNode }) {
  return (
    <WorkflowRuntimeProvider>
      <Studio>{props.children}</Studio>
    </WorkflowRuntimeProvider>
  );
}

function Studio(props: { children?: ReactNode }) {
  const { fireWorkflow } = useRuntimeActions();
  const [drive, dispatchDrive] = useSelectedDrive();
  const nodes = useNodesInSelectedDrive() ?? [];
  const fileNodes = useFileNodesInSelectedDrive() ?? [];
  const workflowDocuments = useWorkflowDocumentsInSelectedDrive() ?? [];
  const selectedNode = useSelectedNode();
  const selectedNodeId = selectedNode?.id;
  const toast = usePHToast();
  // The sidebar selection, kept in the URL; undefined = all runs.
  const [selectedId, select, go] = useItemSelection(selectedNodeId);
  const [creating, setCreating] = useState(false);

  const driveId = drive.header.id;
  const orderedWorkflows = orderWorkflows(
    fileNodes.filter((node) => node.documentType === WORKFLOW_TYPE),
    nodes,
  );
  const workflows = orderedWorkflows.map((item) => item.node);
  const connections = fileNodes.filter(
    (node) => node.documentType === CONNECTION_TYPE,
  );
  const editorOpen = Boolean(props.children && selectedNodeId);

  const create = (documentType: string, baseName: string, count: number) => {
    if (creating) return;
    setCreating(true);
    const name = `${baseName} ${count + 1}`;
    // A new workflow gets a home folder that sorts it last; a failed
    // document removes the folder again.
    const created =
      documentType === WORKFLOW_TYPE
        ? addFolder(
            driveId,
            homeFolderName(nextKey(orderedWorkflows), name),
          ).then((folder) =>
            addDocument(driveId, name, documentType, folder.id).catch(
              async (error: unknown) => {
                await deleteNode(driveId, folder.id).catch(() => undefined);
                throw error;
              },
            ),
          )
        : addDocument(driveId, name, documentType);
    created
      .then((node) => go(node.id, node.id))
      .catch((error: unknown) => {
        toast?.(
          error instanceof Error
            ? error.message
            : `Failed to create ${baseName}`,
          { type: "error" },
        );
      })
      .finally(() => setCreating(false));
  };

  const reorder = (from: number, to: number) => {
    const names = new Map(
      workflowDocuments.map((doc) => [doc.header.id, doc.state.global.name]),
    );
    const actions = reorderActions(orderedWorkflows, from, to, names);
    if (actions.length === 0) return;
    dispatchDrive(actions, (errors) =>
      toast?.(errors[0]?.message ?? "Failed to reorder workflows", {
        type: "error",
      }),
    );
  };

  const showRuns = (node: FileNode | null) => go(node?.id);

  // Resolved from the drive each render, so a deleted node drops out on its own.
  const liveTarget = workflows.find((node) => node.id === selectedId) ?? null;
  // Connections have no page of their own; closing the editor lands on the
  // overview rather than on a selection nothing shows.
  const connectionSelected = connections.some((node) => node.id === selectedId);
  const wasEditing = useRef(editorOpen);
  useEffect(() => {
    if (wasEditing.current && !editorOpen && connectionSelected)
      select(undefined, { replace: true });
    wasEditing.current = editorOpen;
  }, [editorOpen, connectionSelected, select]);
  // A deleted node must not keep the hash pointing at nothing.
  const selectionExists = fileNodes.some((node) => node.id === selectedId);
  useEffect(() => {
    if (selectedId && fileNodes.length > 0 && !selectionExists)
      select(undefined, { replace: true });
  }, [fileNodes.length, select, selectedId, selectionExists]);
  // One feed per pane, shared by the header and the table: the focused
  // workflow's runs, or every run in this drive.
  const focusedWorkflow = liveTarget;
  // The drive feed colours the sidebar and is the overview's own feed; a
  // focused workflow gets its own, so older runs of it aren't cut off.
  const driveFeed = useRuns({ driveId });
  const approvals = usePendingApprovals(driveId);
  // Bumped to scroll the waiting list into view after navigating.
  const [waitingFocus, setWaitingFocus] = useState(0);
  const showApprovals = (workflowId?: string) => {
    go(workflowId);
    setWaitingFocus((request) => request + 1);
  };
  const workflowFeed = useRuns(
    { workflowId: focusedWorkflow?.id },
    Boolean(focusedWorkflow),
  );
  const feed = focusedWorkflow ? workflowFeed : driveFeed;
  const { runs, error: runsError, reload: reloadRuns } = feed;
  const lastRuns = new Map<string, string>();
  for (const run of driveFeed.runs ?? []) {
    if (!lastRuns.has(run.workflowId)) lastRuns.set(run.workflowId, run.status);
  }

  // Step names by key, per workflow, for the approval cards.
  const stepNames = new Map(
    workflowDocuments.map((document) => [
      document.header.id,
      new Map(
        document.state.global.steps.map((step) => [
          step.key,
          step.name || step.key,
        ]),
      ),
    ]),
  );

  // Manual fire only makes sense for the core manual trigger.
  const { data: targetDocument } = useDocumentSafe(liveTarget?.id ?? null);
  const targetTrigger =
    targetDocument?.header.documentType === WORKFLOW_TYPE
      ? (targetDocument as WorkflowDocument).state.global.trigger
      : null;
  const manualTrigger = Boolean(
    targetTrigger && sameBlock(triggerBlock(targetTrigger), MANUAL_TRIGGER),
  );
  // A fire is checked against the published trigger, so its form asks for those.
  const published =
    targetDocument?.header.documentType === WORKFLOW_TYPE
      ? (targetDocument as WorkflowDocument).state.global.published
      : null;
  const firedTrigger = published ? published.trigger : targetTrigger;
  const fireInputs = useMemo(
    () =>
      firedTrigger && sameBlock(triggerBlock(firedTrigger), MANUAL_TRIGGER)
        ? parseManualInputs(firedTrigger.config)
        : [],
    [firedTrigger],
  );

  return (
    // Below md the sidebar sits above the content: side by side, a phone
    // leaves the content ~150px wide and the whole studio scrolls sideways.
    <div className="flex h-full min-h-0 flex-col md:flex-row">
      <Sidebar
        workflows={workflows}
        connections={connections}
        lastRuns={lastRuns}
        approvals={approvals}
        onShowApprovals={showApprovals}
        activeId={selectedId}
        allRunsActive={!selectedId}
        creating={creating}
        onReorderWorkflow={reorder}
        onShowAllRuns={() => showRuns(null)}
        onOpenWorkflow={(node) => showRuns(node)}
        onEditWorkflow={(node) => go(node.id, node.id)}
        onOpenConnection={(node) => go(node.id, node.id)}
        onCreateWorkflow={() =>
          create(WORKFLOW_TYPE, "Workflow", workflows.length)
        }
        onCreateConnection={() =>
          create(CONNECTION_TYPE, "Connection", connections.length)
        }
      />
      {/* Positioned, so absolute descendants (sr-only labels) overflow here,
          not into Connect's scroller around the studio. */}
      <main className="relative min-h-0 min-w-0 flex-1 overflow-y-auto">
        {editorOpen ? (
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex min-h-0 flex-1 flex-col [&>#document-editor-container]:min-h-0">
              <DocumentErrorBoundary
                key={selectedNodeId}
                documentId={selectedNodeId}
                label={selectedNode?.name}
                onDismiss={() => go(selectedId)}
              >
                {props.children}
              </DocumentErrorBoundary>
            </div>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-10">
            {liveTarget ? (
              <WorkflowHeader
                key={liveTarget.id}
                node={liveTarget}
                runs={runs}
                onEdit={() => go(liveTarget.id, liveTarget.id)}
                onDeleted={() => select(undefined, { replace: true })}
              />
            ) : (
              <WorkflowBoard
                runs={runs}
                order={workflows.map((node) => node.id)}
                creating={creating}
                onOpen={(workflowId) => go(workflowId)}
                approvals={approvals}
                onShowApprovals={showApprovals}
                onCreate={() =>
                  create(WORKFLOW_TYPE, "Workflow", workflows.length)
                }
              />
            )}
            <WaitingApprovals
              driveId={liveTarget ? undefined : driveId}
              workflowId={liveTarget?.id}
              showWorkflow={liveTarget === null}
              stepNames={stepNames}
              onChanged={reloadRuns}
              focusRequest={waitingFocus}
            />
            <RunsView
              // The header already names the workflow; don't say it twice.
              title={liveTarget ? "Runs" : "Recent runs"}
              runs={runs}
              error={runsError}
              reload={reloadRuns}
              showWorkflow={liveTarget === null}
              hasMore={feed.hasMore}
              loadingMore={feed.loadingMore}
              onLoadMore={feed.loadMore}
              onFire={
                liveTarget && manualTrigger
                  ? (payload) =>
                      fireWorkflow(liveTarget.id, payload).then(
                        (result) => result.error,
                      )
                  : undefined
              }
              fireInputs={fireInputs}
            />
          </div>
        )}
      </main>
    </div>
  );
}
