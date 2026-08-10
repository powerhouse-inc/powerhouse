import { Modal } from "@powerhousedao/design-system";
import { ModalButton } from "@powerhousedao/design-system/connect";
import {
  closePHModal,
  getDocumentUpgradePreview,
  upgradeDocument,
  useDocumentById,
  useModelRegistry,
  usePHModal,
} from "@powerhousedao/reactor-browser";
import { childLogger } from "document-model";
import { useEffect, useMemo } from "react";

const logger = childLogger(["ConfirmDocumentUpgradeModal"]);

const compactButtonStyle =
  "min-h-0 min-w-0 flex-none rounded-lg px-6 py-1.5 text-sm whitespace-nowrap";

function stripScope(fieldPath: string): string {
  const separatorIndex = fieldPath.indexOf(".");
  return separatorIndex === -1
    ? fieldPath
    : fieldPath.slice(separatorIndex + 1);
}

function FieldList({ label, fields }: { label: string; fields: string[] }) {
  return (
    <div className="mt-3">
      <p className="mb-1.5">{label}</p>
      <div className="flex flex-col items-start gap-1">
        {fields.map((field) => (
          <span
            className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-foreground"
            key={field}
          >
            {stripScope(field)}
          </span>
        ))}
      </div>
    </div>
  );
}

export function ConfirmDocumentUpgradeModal() {
  const phModal = usePHModal();
  const open = phModal?.type === "confirmDocumentUpgrade";
  const documentId = open ? phModal.documentId : undefined;
  const [document] = useDocumentById(documentId);
  const registry = useModelRegistry();
  // Upgrade reducers are third-party code running a dry-run over a cloned
  // document: memoize so they run once per document revision, and guard so a
  // throwing migration degrades to a closed modal instead of a dead modal
  // container.
  const preview = useMemo(() => {
    if (!document) return undefined;
    try {
      return getDocumentUpgradePreview(document, registry);
    } catch (error) {
      logger.error("Failed to compute upgrade preview: @error", error);
      return undefined;
    }
  }, [document, registry]);

  // With the document and registry loaded but no preview, there is nothing to
  // upgrade (already latest, or the migration dry-run failed) — close so the
  // modal system is not stuck on an invisible modal. A missing document or
  // registry only means the hooks are still warming up: stay open and render
  // nothing until they resolve.
  const stuckOpen = open && !!document && !!registry && !preview;
  useEffect(() => {
    if (stuckOpen) closePHModal();
  }, [stuckOpen]);

  if (!document || !preview) {
    return null;
  }

  const { fromVersion, toVersion, steps, addedFields, removedFields } = preview;

  const onContinue = () => {
    upgradeDocument(document.header.id).catch((error) =>
      logger.error("Error upgrading document: @error", error),
    );
    closePHModal();
  };

  return (
    <Modal
      open={open}
      onOpenChange={(status: boolean) => {
        if (!status) return closePHModal();
      }}
    >
      <div className="w-[400px] p-6">
        <div className="pb-2 text-2xl font-bold text-foreground">
          Update document
        </div>
        <div className="my-4 rounded-md bg-background p-4 text-left text-sm text-foreground">
          <p>
            This document will be updated from version {fromVersion} to version{" "}
            {toVersion}. Update required for the latest features.
          </p>
          {steps
            .filter((step) => step.description)
            .map((step) => (
              <p className="mt-2" key={step.toVersion}>
                v{step.toVersion}: {step.description}
              </p>
            ))}
          {addedFields.length > 0 && (
            <FieldList fields={addedFields} label="New fields:" />
          )}
          {removedFields.length > 0 && (
            <FieldList fields={removedFields} label="Removed fields:" />
          )}
          <p className="mt-3">
            Your existing content is preserved and migrated automatically. This
            update cannot be undone.
          </p>
        </div>
        <div className="mt-4 flex justify-between gap-3">
          <ModalButton
            className={compactButtonStyle}
            variant="cancel"
            onClick={() => closePHModal()}
          >
            Cancel
          </ModalButton>
          <ModalButton
            className={compactButtonStyle}
            variant="confirm"
            onClick={onContinue}
          >
            Update document
          </ModalButton>
        </div>
      </div>
    </Modal>
  );
}
