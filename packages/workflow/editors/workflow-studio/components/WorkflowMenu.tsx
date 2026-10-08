// The "…" menu for one workflow: archive or restore it, and delete it behind
// a confirmation that asks for its exact name.
import { Modal } from "@powerhousedao/design-system";
import { deleteNode, useDispatch } from "@powerhousedao/reactor-browser";
import {
  actions as workflowActions,
  type WorkflowDocument,
} from "document-models/workflow";
import { useEffect, useId, useRef, useState } from "react";
import { Button, textInputClass } from "../../shared/controls.js";
import { Icon } from "../../shared/icons.js";
import { deletionTarget } from "./workflow-order.js";

/** Deletes a workflow with its home folder, reading the drive's nodes now. */
export async function deleteWorkflow(workflowId: string): Promise<void> {
  const driveId = window.ph?.selectedDriveId;
  if (!driveId) throw new Error("No drive is selected");
  const nodes =
    window.ph?.drives?.find((drive) => drive.header.id === driveId)?.state
      .global.nodes ?? [];
  await deleteNode(
    driveId,
    deletionTarget(workflowId, nodes)?.id ?? workflowId,
  );
}

export function DeleteWorkflowDialog(props: {
  name: string;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const inputId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const matches = typed === props.name;
  return (
    <Modal
      open
      title="Delete workflow"
      onOpenChange={(open) => {
        if (!open) props.onCancel();
      }}
      contentProps={{
        className:
          "w-[28rem] max-w-[92vw] rounded-xl border border-solid border-foreground/10",
        role: "alertdialog",
        "aria-label": "Delete workflow",
        // Cancel takes the focus, so Enter never deletes by accident.
        onOpenAutoFocus: (event) => {
          event.preventDefault();
          cancelRef.current?.focus();
        },
      }}
    >
      <form
        className="flex flex-col gap-4 p-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (!matches || deleting) return;
          setDeleting(true);
          props.onConfirm().catch((cause: unknown) => {
            setDeleting(false);
            setError(cause instanceof Error ? cause.message : String(cause));
          });
        }}
      >
        <div>
          <h2 className="text-[15px] font-semibold text-foreground">
            Delete workflow
          </h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            This removes the workflow from the drive and can&apos;t be undone.
            To archive it instead, use Archive.
          </p>
        </div>
        <label htmlFor={inputId} className="flex flex-col gap-1.5">
          <span className="text-[13px] text-foreground">
            Type <strong className="font-semibold">{props.name}</strong> to
            confirm
          </span>
          <input
            id={inputId}
            className={textInputClass}
            value={typed}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => setTyped(event.target.value)}
          />
        </label>
        {error ? <p className="text-xs text-wf-fail">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button ref={cancelRef} onClick={props.onCancel}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="destructive"
            disabled={!matches || deleting}
          >
            {deleting ? "Deleting…" : "Delete workflow"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function MenuItem(props: {
  label: string;
  icon: "archive" | "trash" | "retry";
  danger?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] hover:bg-accent focus-visible:bg-accent focus-visible:outline-none ${
        props.danger ? "text-wf-fail" : "text-foreground"
      }`}
      onClick={props.onSelect}
    >
      <Icon name={props.icon} className="h-3.5 w-3.5" />
      {props.label}
    </button>
  );
}

export function WorkflowMenu(props: {
  document: WorkflowDocument;
  // Falls back to the drive node's name while the state has none.
  nodeName?: string;
  onDeleted?: () => void;
  // Revealed on row hover rather than always drawn.
  subtle?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [, dispatch] = useDispatch(props.document);
  const ref = useRef<HTMLDivElement>(null);
  const state = props.document.state.global;
  const name = state.name || props.nodeName || "Untitled workflow";
  const archived = state.status === "ARCHIVED";

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as globalThis.Node)) {
        setOpen(false);
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={`More actions for ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          props.subtle && !open ? "opacity-0 group-hover:opacity-100" : ""
        }`}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        <Icon name="more" className="h-4 w-4" />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 w-44 rounded-md border border-solid border-foreground/10 bg-card p-1 shadow-lg"
        >
          <MenuItem
            label={archived ? "Restore" : "Archive"}
            icon={archived ? "retry" : "archive"}
            onSelect={() => {
              setOpen(false);
              // A restored workflow comes back off; a draft stays a draft.
              const status = archived
                ? state.published
                  ? "DISABLED"
                  : "DRAFT"
                : "ARCHIVED";
              dispatch(workflowActions.setWorkflowStatus({ status }));
            }}
          />
          <MenuItem
            label="Delete…"
            icon="trash"
            danger
            onSelect={() => {
              setOpen(false);
              setConfirming(true);
            }}
          />
        </div>
      ) : null}
      {confirming ? (
        <DeleteWorkflowDialog
          name={name}
          onCancel={() => setConfirming(false)}
          onConfirm={async () => {
            await deleteWorkflow(props.document.header.id);
            setConfirming(false);
            props.onDeleted?.();
          }}
        />
      ) : null}
    </div>
  );
}
