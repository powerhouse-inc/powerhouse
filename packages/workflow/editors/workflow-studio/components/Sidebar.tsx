// Studio navigation: the drive-wide journal, then the drive's workflows and
// connections. Each row carries its document's status as a dot.
import {
  showDeleteNodeModal,
  useDocumentSafe,
} from "@powerhousedao/reactor-browser";
import type { FileNode } from "@powerhousedao/shared/document-drive";
import { useEffect, type ReactNode } from "react";
import { errorMessage } from "../../shared/DocumentErrorBoundary.js";
import { CONNECTION_TONE, toneOf, WORKFLOW_TONE } from "./run-format.js";
import { Icon, StatusDot } from "./ui.js";

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
      className={`group mx-2 flex items-center rounded-md ${
        props.active ? "bg-accent" : "hover:bg-accent/60"
      }`}
    >
      <button
        type="button"
        aria-current={props.active ? "true" : undefined}
        className={`flex min-w-0 grow items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          props.active ? "font-medium text-foreground" : "text-foreground/80"
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
  "flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-background hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100";

const DELETE_ACTION = `${ROW_ACTION} hover:text-wf-fail`;

function DeleteButton(props: { node: FileNode; label: string }) {
  return (
    <button
      type="button"
      title="Delete"
      aria-label={`Delete ${props.label}`}
      className={DELETE_ACTION}
      onClick={() => showDeleteNodeModal(props.node)}
    >
      <Icon name="trash" className="h-3.5 w-3.5" />
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
          className="shrink-0 text-xs text-wf-fail"
          title={`Could not load ${node.id}: ${errorMessage(error)}`}
          aria-hidden
        >
          ⚠
        </span>
        <span className="min-w-0 truncate text-wf-fail">
          {node.name || "(unnamed)"}
        </span>
      </Row>
    );
  }

  const status = documentStatus(document);
  const tone = toneOf(
    node.documentType === WORKFLOW_TYPE ? WORKFLOW_TONE : CONNECTION_TONE,
    status,
  );
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
              <Icon name="pencil" className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <DeleteButton node={node} label={documentName(document, node.name)} />
        </span>
      }
    >
      <span title={status} className="flex">
        <StatusDot tone={tone} />
      </span>
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
    <div className="mt-5">
      <div className="mb-1 flex items-center justify-between pl-4 pr-3">
        <h3 className="text-xs font-medium text-muted-foreground">
          {props.title}
        </h3>
        <button
          type="button"
          disabled={props.creating}
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          title={props.addLabel}
          aria-label={props.addLabel}
          onClick={props.onCreate}
        >
          <Icon name="plus" className="h-3.5 w-3.5" />
        </button>
      </div>
      {props.nodes.length === 0 ? (
        <p className="px-4 py-1 text-xs text-muted-foreground">{props.empty}</p>
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
    <aside className="w-60 shrink-0 overflow-y-auto border-r border-solid border-border bg-muted/50 py-3">
      <Row active={props.allRunsActive} onClick={props.onShowAllRuns}>
        <Icon name="list" className="text-muted-foreground" />
        <span>All runs</span>
      </Row>
      <Section
        title="Workflows"
        addLabel="New workflow"
        empty="No workflows yet."
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
        empty="No connections yet."
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
