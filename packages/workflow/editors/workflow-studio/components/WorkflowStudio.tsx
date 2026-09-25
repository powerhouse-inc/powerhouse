// Workflow Studio: drive app listing workflows and connections with a
// GitHub-Actions-style run journal; opens the per-document editors inline.
import {
  addDocument,
  setSelectedNode,
  useDocumentSafe,
  useFileNodesInSelectedDrive,
  usePHToast,
  useSelectedDrive,
  useSelectedNode,
} from "@powerhousedao/reactor-browser";
import type { FileNode } from "@powerhousedao/shared/document-drive";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { type WorkflowDocument } from "document-models/workflow";
import { fireWorkflow } from "../../workflow-editor/runtime-api.js";
import "../../workflow-editor/runtime-piece-source.js";
import { DocumentErrorBoundary } from "../../shared/DocumentErrorBoundary.js";
import { RunsView } from "./RunsView.js";
import { Sidebar } from "./Sidebar.js";
import { useHashSelection } from "./use-hash-selection.js";
import { useRuns } from "./useRuns.js";
import { WorkflowBoard } from "./WorkflowBoard.js";
import { WorkflowHeader } from "./WorkflowHeader.js";

const WORKFLOW_TYPE = "powerhouse/workflow";
const CONNECTION_TYPE = "powerhouse/connection";

export function WorkflowStudio(props: { children?: ReactNode }) {
  const [drive] = useSelectedDrive();
  const fileNodes = useFileNodesInSelectedDrive() ?? [];
  const selectedNode = useSelectedNode();
  const selectedNodeId = selectedNode?.id;
  const toast = usePHToast();
  // The sidebar selection, kept in the URL hash; undefined = all runs.
  const [selectedId, select] = useHashSelection();
  const [creating, setCreating] = useState(false);

  const driveId = drive.header.id;
  const workflows = fileNodes.filter(
    (node) => node.documentType === WORKFLOW_TYPE,
  );
  const connections = fileNodes.filter(
    (node) => node.documentType === CONNECTION_TYPE,
  );
  const editorOpen = Boolean(props.children && selectedNodeId);

  const create = (documentType: string, baseName: string, count: number) => {
    if (creating) return;
    setCreating(true);
    addDocument(driveId, `${baseName} ${count + 1}`, documentType)
      .then((node) => {
        select(node.id);
        setSelectedNode(node.id);
      })
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

  const showRuns = (node: FileNode | null) => {
    setSelectedNode(undefined);
    select(node?.id);
  };

  // Resolved from the drive each render, so a deleted node drops out on its own.
  const liveTarget = workflows.find((node) => node.id === selectedId) ?? null;
  // Connections have no page of their own; closing the editor lands on the
  // overview rather than on a selection nothing shows.
  const connectionSelected = connections.some((node) => node.id === selectedId);
  const wasEditing = useRef(editorOpen);
  useEffect(() => {
    if (wasEditing.current && !editorOpen && connectionSelected)
      select(undefined);
    wasEditing.current = editorOpen;
  }, [editorOpen, connectionSelected, select]);
  // A deleted node must not keep the hash pointing at nothing.
  const selectionExists = fileNodes.some((node) => node.id === selectedId);
  useEffect(() => {
    if (selectedId && fileNodes.length > 0 && !selectionExists)
      select(undefined);
  }, [fileNodes.length, select, selectedId, selectionExists]);
  // One feed per pane, shared by the header and the table: the focused
  // workflow's runs, or every run in this drive.
  const focusedWorkflow = liveTarget;
  // The drive feed colours the sidebar and is the overview's own feed; a
  // focused workflow gets its own, so older runs of it aren't cut off.
  const driveFeed = useRuns({ driveId });
  const workflowFeed = useRuns(
    { workflowId: focusedWorkflow?.id },
    Boolean(focusedWorkflow),
  );
  const {
    runs,
    error: runsError,
    reload: reloadRuns,
  } = focusedWorkflow ? workflowFeed : driveFeed;
  const lastRuns = new Map<string, string>();
  for (const run of driveFeed.runs ?? []) {
    if (!lastRuns.has(run.workflowId)) lastRuns.set(run.workflowId, run.status);
  }

  // Manual fire only makes sense for core#manual triggers.
  const { data: targetDocument } = useDocumentSafe(liveTarget?.id ?? null);
  const manualTrigger =
    targetDocument?.header.documentType === WORKFLOW_TYPE &&
    (targetDocument as WorkflowDocument).state.global.trigger?.blockType ===
      "core#manual";

  return (
    <div className="flex h-full min-h-0">
      <Sidebar
        workflows={workflows}
        connections={connections}
        lastRuns={lastRuns}
        activeId={selectedId}
        allRunsActive={!selectedId}
        creating={creating}
        onShowAllRuns={() => showRuns(null)}
        onOpenWorkflow={(node) => showRuns(node)}
        onEditWorkflow={(node) => {
          select(node.id);
          setSelectedNode(node.id);
        }}
        onOpenConnection={(node) => {
          select(node.id);
          setSelectedNode(node.id);
        }}
        onCreateWorkflow={() =>
          create(WORKFLOW_TYPE, "Workflow", workflows.length)
        }
        onCreateConnection={() =>
          create(CONNECTION_TYPE, "Connection", connections.length)
        }
      />
      <main className="min-w-0 flex-1 overflow-y-auto">
        {editorOpen ? (
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex min-h-0 flex-1 flex-col [&>#document-editor-container]:min-h-0">
              <DocumentErrorBoundary
                key={selectedNodeId}
                documentId={selectedNodeId}
                label={selectedNode?.name}
                onDismiss={() => setSelectedNode(undefined)}
              >
                {props.children}
              </DocumentErrorBoundary>
            </div>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-6xl px-8 py-10">
            {liveTarget ? (
              <WorkflowHeader
                key={liveTarget.id}
                node={liveTarget}
                runs={runs}
                onEdit={() => setSelectedNode(liveTarget.id)}
              />
            ) : (
              <WorkflowBoard
                runs={runs}
                creating={creating}
                onOpen={(workflowId) => select(workflowId)}
                onCreate={() =>
                  create(WORKFLOW_TYPE, "Workflow", workflows.length)
                }
              />
            )}
            <RunsView
              // The header already names the workflow; don't say it twice.
              title={liveTarget ? "Runs" : "Recent runs"}
              runs={runs}
              error={runsError}
              reload={reloadRuns}
              showWorkflow={liveTarget === null}
              onFire={
                liveTarget && manualTrigger
                  ? () =>
                      fireWorkflow(liveTarget.id).then((result) => result.error)
                  : undefined
              }
            />
          </div>
        )}
      </main>
    </div>
  );
}
