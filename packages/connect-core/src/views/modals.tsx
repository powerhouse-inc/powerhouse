// Core's modals: the ones editors, drive apps and the reactor open, in core's plain style.
import {
  addDocument,
  closePHModal,
  deleteNode,
  exportFile,
  getDocumentUpgradePreview,
  logout,
  openRenown,
  openTarget,
  setSelectedNode,
  showPHModal,
  upgradeDocument,
  useDocumentById,
  useDocumentModelModuleById,
  useModelRegistry,
  useNodeById,
  useNodeParentFolderById,
  usePHModal,
  useRenownAuth,
  useRenownLoginMethods,
  useUser,
  validateDocument,
} from "@powerhousedao/reactor-browser";
import type { PHModal } from "@powerhousedao/reactor-browser";
import type { ReactNode } from "react";
import { createElement, useEffect, useId, useState } from "react";
import type { ModalFrameProps } from "../router/modal-frame.js";
import { ModalDialog, useModalFrame } from "../router/modal-frame.js";
import { useDriveRouteData } from "../router/route-data.js";

const buttonClass =
  "rounded border border-core-border px-3 py-1 text-sm hover:bg-core-hover disabled:opacity-50";
const primaryClass = `${buttonClass} font-semibold`;

/** Core's modal frame: title, content, and the buttons on the right. */
function CoreModalFrame({
  title,
  titleId,
  actions,
  children,
}: ModalFrameProps) {
  return (
    <ModalDialog
      labelledBy={titleId}
      className="m-auto w-96 max-w-[calc(100vw-2rem)] rounded border border-core-border bg-core-bg p-5 text-core-fg backdrop:bg-black/30"
    >
      <h2 id={titleId} className="mb-3 text-lg font-semibold">
        {title}
      </h2>
      <div className="flex flex-col gap-2 text-sm">{children}</div>
      <div className="mt-4 flex justify-end gap-2">{actions}</div>
    </ModalDialog>
  );
}

/** A modal in the routes' frame, else core's. */
function Dialog(props: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const Frame = useModalFrame() ?? CoreModalFrame;
  const titleId = useId();
  const actions = props.actions ?? (
    <button type="button" className={buttonClass} onClick={closePHModal}>
      Close
    </button>
  );
  // A registered frame, not one made here.
  return createElement(Frame, {
    title: props.title,
    titleId,
    actions,
    children: props.children,
  });
}

const Cancel = () => (
  <button type="button" className={buttonClass} onClick={closePHModal}>
    Cancel
  </button>
);

function useModal<T extends PHModal["type"]>(type: T) {
  const modal = usePHModal();
  return modal?.type === type
    ? (modal as Extract<PHModal, { type: T }>)
    : undefined;
}

/** A new document of the modal's type, in the open drive and folder. */
export function CreateDocumentModal() {
  const modal = useModal("createDocument");
  const module = useDocumentModelModuleById(
    modal?.documentType,
    modal?.documentModelVersion,
  );
  const { drive, folder } = useDriveRouteData();
  const [name, setName] = useState("");
  const typeName = module?.documentModel.global.name ?? modal?.documentType;
  const create = async () => {
    if (!drive || !module || !modal) return;
    closePHModal();
    const node = await addDocument(
      drive.header.id,
      name.trim() || `New ${typeName}`,
      module.documentModel.global.id,
      folder?.id,
      undefined,
      undefined,
      undefined,
      modal.documentModelVersion,
    );
    setSelectedNode(node);
  };
  return (
    <Dialog
      title={`New ${typeName ?? "document"}`}
      actions={
        <>
          <Cancel />
          <button
            type="submit"
            form="create-document"
            className={primaryClass}
            disabled={!drive || !module}
          >
            Create
          </button>
        </>
      }
    >
      <form
        id="create-document"
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <label className="flex flex-col gap-1">
          Name
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={`New ${typeName}`}
            className="rounded border border-core-border bg-core-bg px-2 py-1"
          />
        </label>
      </form>
      {!drive && <p className="text-core-muted">Open a drive first.</p>}
    </Dialog>
  );
}

/** Signs in with Renown: the configured methods, else its portal. */
export function LoginModal() {
  const user = useUser();
  const methods = useRenownLoginMethods();
  const { login, pending, error } = useRenownAuth();
  useEffect(() => {
    if (user) closePHModal();
  }, [user]);
  return (
    <Dialog title="Log in">
      {methods.length ? (
        methods.map((method) => (
          <button
            key={method.id}
            type="button"
            className={buttonClass}
            disabled={pending}
            onClick={() => {
              closePHModal();
              login(undefined, method.id);
            }}
          >
            {method.label}
          </button>
        ))
      ) : (
        <button
          type="button"
          className={primaryClass}
          onClick={() => openRenown()}
        >
          Continue with Renown
        </button>
      )}
      {error && <p className="text-core-muted">{error.message}</p>}
    </Dialog>
  );
}

/** Deletes a file or folder, then opens its parent. */
export function DeleteItemModal() {
  const modal = useModal("deleteItem");
  const node = useNodeById(modal?.id);
  const parent = useNodeParentFolderById(modal?.id);
  const { drive } = useDriveRouteData();
  const remove = async () => {
    closePHModal();
    if (!drive || !modal) return;
    await deleteNode(drive.header.id, modal.id);
    setSelectedNode(parent);
  };
  return (
    <Dialog
      title={`Delete ${node?.name ?? "item"}?`}
      actions={
        <>
          <Cancel />
          <button
            type="button"
            className={primaryClass}
            onClick={() => void remove()}
          >
            Delete
          </button>
        </>
      }
    >
      <p>
        {node?.kind === "folder"
          ? "The folder and everything in it will be deleted."
          : "The document will be deleted."}
      </p>
    </Dialog>
  );
}

/** Upgrades a document to its model's latest version. */
export function ConfirmDocumentUpgradeModal() {
  const modal = useModal("confirmDocumentUpgrade");
  const [document] = useDocumentById(modal?.documentId);
  const registry = useModelRegistry();
  const preview = document
    ? getDocumentUpgradePreview(document, registry)
    : undefined;
  if (!document || !preview) return null;
  const upgrade = () => {
    closePHModal();
    upgradeDocument(document.header.id).catch((error: unknown) => {
      console.error("[connect] the document upgrade failed:", error);
    });
  };
  return (
    <Dialog
      title="Update document"
      actions={
        <>
          <Cancel />
          <button type="button" className={primaryClass} onClick={upgrade}>
            Update document
          </button>
        </>
      }
    >
      <p>
        From version {preview.fromVersion} to {preview.toVersion}. Existing
        content is migrated; this can't be undone.
      </p>
      {preview.steps
        .filter((step) => step.description)
        .map((step) => (
          <p key={step.toVersion}>
            v{step.toVersion}: {step.description}
          </p>
        ))}
    </Dialog>
  );
}

/** Exports a document that has validation errors, after listing them. */
export function DownloadDocumentWithErrorsModal() {
  const modal = useModal("downloadDocumentWithErrors");
  const [document] = useDocumentById(modal?.documentId);
  if (!document) return null;
  const errors = validateDocument(document);
  const download = () => {
    closePHModal();
    exportFile(document).catch((error: unknown) => {
      console.error("[connect] the export failed:", error);
    });
  };
  return (
    <Dialog
      title="The document has errors"
      actions={
        <>
          <Cancel />
          <button type="button" className={primaryClass} onClick={download}>
            Export anyway
          </button>
        </>
      }
    >
      <ul className="list-disc pl-5 text-core-muted">
        {errors.map((error, index) => (
          <li key={index}>{error.message}</li>
        ))}
      </ul>
    </Dialog>
  );
}

/** A document whose model version no installed package provides. */
export function DocumentVersionUnsupportedModal() {
  const modal = useModal("documentVersionUnsupported");
  if (!modal) return null;
  const { documentType, requiredVersion, availableVersions } = modal;
  return (
    <Dialog
      title="Document version not supported"
      actions={
        <>
          <Cancel />
          <button
            type="button"
            className={primaryClass}
            onClick={() => {
              closePHModal();
              openTarget({ settings: "packages" });
            }}
          >
            Show packages
          </button>
        </>
      }
    >
      <p>
        This document needs version {requiredVersion} of "{documentType}"; the
        installed packages provide {availableVersions.join(", ")}.
      </p>
    </Dialog>
  );
}

/** A protected drive that couldn't be added: sign in, or as someone else. */
export function DriveAuthRequiredModal() {
  const user = useUser();
  return (
    <Dialog
      title={user ? "No access to this drive" : "Log in to access this drive"}
      actions={
        <>
          <Cancel />
          {user ? (
            <button
              type="button"
              className={primaryClass}
              onClick={() => {
                closePHModal();
                void logout();
              }}
            >
              Log out
            </button>
          ) : (
            <button
              type="button"
              className={primaryClass}
              onClick={() => showPHModal({ type: "login" })}
            >
              Log in
            </button>
          )}
        </>
      }
    >
      <p>
        {user
          ? "The account you're signed in with can't open this drive."
          : "This drive is only open to signed-in users."}
      </p>
    </Dialog>
  );
}
