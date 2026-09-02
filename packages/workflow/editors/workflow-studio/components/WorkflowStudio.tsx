// Workflow Studio: drive app listing workflows and connections with a
// GitHub-Actions-style run journal; opens the per-document editors inline.
import {
  addDocument,
  setSelectedNode,
  useDocumentById,
  useFileNodesInSelectedDrive,
  usePHToast,
  useSelectedDrive,
  useSelectedNode,
} from "@powerhousedao/reactor-browser";
import type { FileNode } from "@powerhousedao/shared/document-drive";
import { useState, type ReactNode } from "react";
import {
  actions as workflowActions,
  type WorkflowDocument,
} from "document-models/workflow";
import { fireWorkflow } from "../../workflow-editor/runtime-api.js";
import { RunsView } from "./RunsView.js";

const WORKFLOW_TYPE = "powerhouse/workflow";
const CONNECTION_TYPE = "powerhouse/connection";

function SidebarSection(props: {
  title: string;
  nodes: FileNode[];
  activeId?: string | null;
  onOpen: (node: FileNode) => void;
  onEdit?: (node: FileNode) => void;
  onCreate: () => void;
  creating: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between px-3 pb-1 pt-4">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          {props.title}
        </span>
        <button
          type="button"
          disabled={props.creating}
          className="rounded px-1.5 text-sm leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
          title={`New ${props.title.toLowerCase().replace(/s$/, "")}`}
          onClick={props.onCreate}
        >
          +
        </button>
      </div>
      {props.nodes.length === 0 ? (
        <p className="px-3 py-1 text-xs text-slate-300">None yet</p>
      ) : (
        props.nodes.map((node) => (
          <div
            key={node.id}
            className={`group flex items-center ${
              props.activeId === node.id ? "bg-blue-50" : "hover:bg-slate-50"
            }`}
          >
            <button
              type="button"
              className="min-w-0 grow truncate px-3 py-1.5 text-left text-sm text-slate-700"
              onClick={() => props.onOpen(node)}
            >
              {node.name || "(unnamed)"}
            </button>
            {props.onEdit ? (
              <button
                type="button"
                className="mr-2 hidden shrink-0 rounded px-1 text-xs text-slate-400 hover:text-slate-700 group-hover:block"
                title="Open editor"
                onClick={() => props.onEdit!(node)}
              >
                ✎
              </button>
            ) : null}
          </div>
        ))
      )}
    </div>
  );
}

const WORKFLOW_STATUS_STYLES: Record<string, string> = {
  ENABLED: "bg-green-100 text-green-700",
  DRAFT: "bg-slate-100 text-slate-500",
  DISABLED: "bg-amber-100 text-amber-700",
  ARCHIVED: "bg-slate-200 text-slate-400",
};

// Status chip + enable/disable toggle for the workflow whose runs are shown.
function WorkflowStatusBar(props: { workflowId: string }) {
  const [document, dispatch] = useDocumentById(props.workflowId);
  if (document?.header.documentType !== WORKFLOW_TYPE) return null;
  const workflow = document as WorkflowDocument;
  const status = workflow.state.global.status;
  const next = status === "ENABLED" ? "DISABLED" : "ENABLED";
  return (
    <div className="mb-3 flex items-center gap-2">
      <span
        className={`rounded px-2 py-0.5 text-xs font-semibold ${WORKFLOW_STATUS_STYLES[status] ?? "bg-slate-100 text-slate-500"}`}
      >
        {status}
      </span>
      <button
        type="button"
        className="rounded border border-solid border-slate-300 px-2 py-0.5 text-xs text-slate-600"
        onClick={() =>
          dispatch(workflowActions.setWorkflowStatus({ status: next }))
        }
      >
        {next === "ENABLED" ? "Enable" : "Disable"}
      </button>
    </div>
  );
}

export function WorkflowStudio(props: { children?: ReactNode }) {
  const [drive] = useSelectedDrive();
  const fileNodes = useFileNodesInSelectedDrive() ?? [];
  const selectedNodeId = useSelectedNode()?.id;
  const toast = usePHToast();
  // Which workflow's runs are shown; null = all runs in the drive.
  const [runsTarget, setRunsTarget] = useState<FileNode | null>(null);
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
    setRunsTarget(node);
  };

  // Keep the runs target in sync when its node was renamed/deleted.
  const liveTarget = runsTarget
    ? (workflows.find((node) => node.id === runsTarget.id) ?? null)
    : null;

  return (
    <div className="flex h-full min-h-0">
      <aside className="w-56 shrink-0 overflow-y-auto border-r border-solid border-slate-200">
        <button
          type="button"
          className={`mt-2 w-full px-3 py-1.5 text-left text-sm font-medium ${
            !editorOpen && !liveTarget
              ? "bg-blue-50 text-blue-700"
              : "text-slate-700 hover:bg-slate-50"
          }`}
          onClick={() => showRuns(null)}
        >
          All runs
        </button>
        <SidebarSection
          title="Workflows"
          nodes={workflows}
          activeId={editorOpen ? selectedNodeId : liveTarget?.id}
          onOpen={(node) => showRuns(node)}
          onEdit={(node) => {
            setRunsTarget(node);
            setSelectedNode(node.id);
          }}
          onCreate={() => create(WORKFLOW_TYPE, "Workflow", workflows.length)}
          creating={creating}
        />
        <SidebarSection
          title="Connections"
          nodes={connections}
          activeId={editorOpen ? selectedNodeId : undefined}
          onOpen={(node) => setSelectedNode(node.id)}
          onCreate={() =>
            create(CONNECTION_TYPE, "Connection", connections.length)
          }
          creating={creating}
        />
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto">
        {editorOpen ? (
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex items-center border-b border-solid border-slate-100 px-3 py-1.5">
              <button
                type="button"
                className="text-xs text-slate-500 hover:text-slate-800"
                onClick={() => setSelectedNode(undefined)}
              >
                ← Back to runs
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col [&>#document-editor-container]:min-h-0">
              {props.children}
            </div>
          </div>
        ) : (
          <div className="p-6">
            {liveTarget ? (
              <WorkflowStatusBar workflowId={liveTarget.id} />
            ) : null}
            <RunsView
              key={liveTarget?.id ?? "__all__"}
              workflowId={liveTarget?.id}
              title={liveTarget ? liveTarget.name || "Workflow" : "All runs"}
              onFire={
                liveTarget
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
