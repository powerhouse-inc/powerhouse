import { ConnectConfirmationModal } from "@powerhousedao/design-system/connect";
import {
  closePHModal,
  showPHModal,
  usePHModal,
} from "@powerhousedao/reactor-browser";

export function DocumentVersionUnsupportedModal() {
  const phModal = usePHModal();
  const open = phModal?.type === "documentVersionUnsupported";

  if (!open) {
    return null;
  }

  const { documentType, requiredVersion, availableVersions } = phModal;

  return (
    <ConnectConfirmationModal
      header="Document version not supported"
      body={`This document was created with version ${requiredVersion} of "${documentType}", but this Connect instance only has version${availableVersions.length > 1 ? "s" : ""} ${availableVersions.join(", ")} installed. Update the package that provides "${documentType}" to open this document.`}
      cancelLabel="Close"
      continueLabel="Open package manager"
      onCancel={() => closePHModal()}
      onContinue={() => {
        closePHModal();
        showPHModal({ type: "settings" });
      }}
      open={open}
      onOpenChange={(status: boolean) => {
        if (!status) return closePHModal();
      }}
    />
  );
}
