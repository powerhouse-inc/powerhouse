import { ConnectConfirmationModal } from "@powerhousedao/design-system/connect";
import {
  closePHModal,
  getDocumentUpgradePreview,
  upgradeDocument,
  useDocumentById,
  useModelRegistry,
  usePHModal,
} from "@powerhousedao/reactor-browser";
import { childLogger } from "document-model";

const logger = childLogger(["ConfirmDocumentUpgradeModal"]);

export function ConfirmDocumentUpgradeModal() {
  const phModal = usePHModal();
  const open = phModal?.type === "confirmDocumentUpgrade";
  const documentId = open ? phModal.documentId : undefined;
  const [document] = useDocumentById(documentId);
  const registry = useModelRegistry();
  const preview = document
    ? getDocumentUpgradePreview(document, registry)
    : undefined;

  if (!document || !preview) {
    return null;
  }

  const { fromVersion, toVersion, steps, addedFields, removedFields } = preview;

  return (
    <ConnectConfirmationModal
      header="Update document"
      body={
        <div className="text-left text-sm">
          <p>
            This document will be updated from version {fromVersion} to version{" "}
            {toVersion}.
          </p>
          {steps
            .filter((step) => step.description)
            .map((step) => (
              <p className="mt-2" key={step.toVersion}>
                v{step.toVersion}: {step.description}
              </p>
            ))}
          {addedFields.length > 0 && (
            <p className="mt-2">
              New fields:{" "}
              <code className="font-mono text-xs">
                {addedFields.join(", ")}
              </code>
            </p>
          )}
          {removedFields.length > 0 && (
            <p className="mt-2">
              Removed fields:{" "}
              <code className="font-mono text-xs">
                {removedFields.join(", ")}
              </code>
            </p>
          )}
          <p className="mt-2">
            Your existing content is preserved and migrated automatically. This
            update cannot be undone.
          </p>
        </div>
      }
      cancelLabel="Cancel"
      continueLabel="Update document"
      onCancel={() => closePHModal()}
      onContinue={() => {
        upgradeDocument(document.header.id).catch((error) =>
          logger.error("Error upgrading document: @error", error),
        );
        closePHModal();
      }}
      open={open}
      onOpenChange={(status: boolean) => {
        if (!status) return closePHModal();
      }}
    />
  );
}
