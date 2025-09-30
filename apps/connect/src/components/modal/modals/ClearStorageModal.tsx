import { clearReactorStorage } from "#store";
import { ConnectConfirmationModal } from "@powerhousedao/design-system";
import {
  closePHModal,
  setSelectedDrive,
  setSelectedNode,
  showPHModal,
  usePHModal,
} from "@powerhousedao/reactor-browser";
import { useTranslation } from "react-i18next";
export function ClearStorageModal() {
  const phModal = usePHModal();
  const open = phModal?.type === "clearStorage";
  const { t } = useTranslation();

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
      onContinue={async () => {
        try {
          await clearReactorStorage();
        } catch (error) {
          console.error(error);
        } finally {
          setSelectedDrive(undefined);
          setSelectedNode(undefined);
          closePHModal();
        }
      }}
      onOpenChange={(status: boolean) => {
        if (!status) return closePHModal();
      }}
    />
  );
}
