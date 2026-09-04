// Studio navigation: the drive-wide journal, then the drive's workflows and
// connections. Each row carries its document's status as a dot.
import {
  showDeleteNodeModal,
  useDocumentSafe,
} from "@powerhousedao/reactor-browser";
import type { FileNode } from "@powerhousedao/shared/document-drive";
import { useEffect, type ReactNode } from "react";
import { errorMessage } from "../../shared/DocumentErrorBoundary.js";
import { CONNECTION_STATUS_DOT, WORKFLOW_STATUS_DOT } from "./run-format.js";

const WORKFLOW_TYPE = "powerhouse/workflow";

// The drive node name goes stale after renames; the document state is the
// source of truth for both workflow and connection names.
function documentName(document: unknown, fallback: string): string {
  const state = (document as { state?: { global?: { name?: string } } } | null)
    ?.state?.global;
  return state?.name || fallback || "(unnamed)";
}

function documentStatus(document: unknown): string | undefined {
  const state = (
    document as { state?: { global?: { status?: string } } } | null
  )?.state?.global;
  return state?.status;
}

function Row(props: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div
      className={`group mx-2 flex items-center rounded ${
        props.active ? "bg-white ring-1 ring-slate-200" : "hover:bg-slate-100"
      }`}
    >
      <button
        type="button"
        aria-current={props.active ? "true" : undefined}
        className={`flex min-w-0 grow items-center gap-2 px-2 py-1.5 text-left text-sm ${
          props.active ? "text-slate-900" : "text-slate-600"
        }`}
        onClick={props.onClick}
      >
        {props.children}
      </button>
      {props.trailing}
    </div>
  );
}

const ROW_ACTION =
  "shrink-0 rounded px-1 py-0.5 text-xs text-slate-400 opacity-0 hover:bg-slate-200 hover:text-slate-700 focus-visible:opacity-100 group-hover:opacity-100";

const DELETE_ACTION = `${ROW_ACTION} hover:bg-red-100 hover:text-red-600`;

function DeleteButton(props: { node: FileNode; label: string }) {
  return (
    <button
      type="button"
      title="Delete"
      aria-label={`Delete ${props.label}`}
      className={DELETE_ACTION}
      onClick={() => showDeleteNodeModal(props.node)}
    >
      <span aria-hidden>🗑</span>
    </button>
  );
}

// A node can outlive its document (deleted, or unreadable history), so one
// broken node degrades to its drive name plus a warning marker.
function NodeRow(props: {
  node: FileNode;
  active: boolean;
  onOpen: () => void;
  onEdit?: () => void;
}) {
  const { node } = props;
  const { data: document, error } = useDocumentSafe(node.id);
  useEffect(() => {
    if (error !== undefined) {
      console.error(`Failed to load document ${node.id}:`, error);
    }
  }, [error, node.id]);

  if (error !== undefined) {
    return (
      <Row
        active={props.active}
        onClick={props.onOpen}
        trailing={
          <span className="mr-1.5 flex shrink-0 items-center">
            <DeleteButton node={node} label={node.name || node.id} />
          </span>
        }
      >
        <span
          className="shrink-0 text-xs text-red-600"
          title={`Could not load ${node.id}: ${errorMessage(error)}`}
          aria-hidden
        >
          ⚠
        </span>
        <span className="min-w-0 truncate text-red-600">
          {node.name || "(unnamed)"}
        </span>
      </Row>
    );
  }

  const status = documentStatus(document);
  const dots =
    node.documentType === WORKFLOW_TYPE
      ? WORKFLOW_STATUS_DOT
      : CONNECTION_STATUS_DOT;
  return (
    <Row
      active={props.active}
      onClick={props.onOpen}
      trailing={
        <span className="mr-1.5 flex shrink-0 items-center">
          {props.onEdit ? (
            <button
              type="button"
              title="Open in editor"
              aria-label={`Open ${documentName(document, node.name)} in the editor`}
              className={ROW_ACTION}
              onClick={props.onEdit}
            >
              <span aria-hidden>✎</span>
            </button>
          ) : null}
          <DeleteButton node={node} label={documentName(document, node.name)} />
        </span>
      }
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
          status ? (dots[status] ?? "bg-slate-300") : "bg-slate-200"
        }`}
        title={status}
      />
      <span className="min-w-0 truncate">
        {documentName(document, node.name)}
      </span>
    </Row>
  );
}

function Section(props: {
  title: string;
  addLabel: string;
  empty: string;
  nodes: FileNode[];
  activeId?: string | null;
  onOpen: (node: FileNode) => void;
  onEdit?: (node: FileNode) => void;
  onCreate: () => void;
  creating: boolean;
}) {
  return (
    <div className="mt-2">
      {/* A banded header, so the two groups read as separate lists. */}
      <div className="mb-1.5 flex items-center justify-between border-y border-solid border-slate-200 bg-slate-100 px-4 py-1.5">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
          {props.title}
        </span>
        <button
          type="button"
          disabled={props.creating}
          className="flex h-5 w-5 items-center justify-center rounded border border-solid border-transparent text-sm leading-none text-slate-500 hover:border-slate-300 hover:bg-white hover:text-slate-800 disabled:opacity-50"
          title={props.addLabel}
          aria-label={props.addLabel}
          onClick={props.onCreate}
        >
          <span aria-hidden>+</span>
        </button>
      </div>
      {props.nodes.length === 0 ? (
        <p className="px-4 py-1 text-xs text-slate-400">{props.empty}</p>
      ) : (
        <div className="flex flex-col gap-0.5">
          {props.nodes.map((node) => (
            <NodeRow
              key={node.id}
              node={node}
              active={props.activeId === node.id}
              onOpen={() => props.onOpen(node)}
              onEdit={props.onEdit ? () => props.onEdit!(node) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar(props: {
  workflows: FileNode[];
  connections: FileNode[];
  activeId?: string | null;
  allRunsActive: boolean;
  creating: boolean;
  onShowAllRuns: () => void;
  onOpenWorkflow: (node: FileNode) => void;
  onEditWorkflow: (node: FileNode) => void;
  onOpenConnection: (node: FileNode) => void;
  onEditConnection: (node: FileNode) => void;
  onCreateWorkflow: () => void;
  onCreateConnection: () => void;
}) {
  return (
    <aside className="w-60 shrink-0 overflow-y-auto border-r border-solid border-slate-200 bg-slate-50 py-2">
      <Row active={props.allRunsActive} onClick={props.onShowAllRuns}>
        <span aria-hidden className="shrink-0 text-xs text-slate-400">
          ☰
        </span>
        <span className="font-medium">All runs</span>
      </Row>
      <Section
        title="Workflows"
        addLabel="New workflow"
        empty="No workflows yet. Use + to add one."
        nodes={props.workflows}
        activeId={props.activeId}
        onOpen={props.onOpenWorkflow}
        onEdit={props.onEditWorkflow}
        onCreate={props.onCreateWorkflow}
        creating={props.creating}
      />
      <Section
        title="Connections"
        addLabel="New connection"
        empty="No connections yet. Use + to add one."
        nodes={props.connections}
        activeId={props.activeId}
        onOpen={props.onOpenConnection}
        onEdit={props.onEditConnection}
        onCreate={props.onCreateConnection}
        creating={props.creating}
      />
    </aside>
  );
}
