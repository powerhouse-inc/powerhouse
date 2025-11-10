import { clearReactorStorage } from "@powerhousedao/connect/store/reactor";
import { ConnectConfirmationModal } from "@powerhousedao/design-system/connect/components/modal/confirmation-modal";
import {
  closePHModal,
  setSelectedDrive,
  setSelectedNode,
  showPHModal,
  usePHModal,
} from "@powerhousedao/reactor-browser";
import { childLogger } from "document-drive";
import { useState } from "react";
import { useTranslation } from "react-i18next";

const logger = childLogger(["ClearStorage"]);

export function ClearStorageModal() {
  const phModal = usePHModal();
  const open = phModal?.type === "clearStorage";
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  function clearStorage() {
    setLoading(true);
    clearReactorStorage()
      .then(() => {
        logger.info("Storage cleared");
        setSelectedDrive(undefined);
        setSelectedNode(undefined);
        window.location.reload();
      })
      .catch((error) => {
        logger.error("Error clearing storage", error);
        setLoading(false);
      });
  }

  return (
    <ConnectConfirmationModal
      open={open}
      header={t("modals.clearStorage.title")}
      title={t("modals.clearStorage.title")}
      body={t("modals.connectSettings.clearStorage.confirmation.body")}
      cancelLabel={t("common.cancel")}
      continueLabel={t(
        "modals.connectSettings.clearStorage.confirmation.clearButton",
      )}
      onCancel={() => showPHModal({ type: "settings" })}
      onContinue={clearStorage}
      onOpenChange={(status: boolean) => {
        if (!status) return closePHModal();
      }}
      continueButtonProps={{
        disabled: loading,
      }}
    />
  );
}
