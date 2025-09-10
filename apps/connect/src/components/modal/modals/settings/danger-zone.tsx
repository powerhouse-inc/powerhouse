import { DangerZone as BaseDangerZone } from "@powerhousedao/design-system";
import {
  deleteDrive,
  setSelectedDrive,
  setSelectedNode,
  useDrives,
} from "@powerhousedao/reactor-browser";
import { type DocumentDriveDocument, logger } from "document-drive";
import { useTranslation } from "react-i18next";
import { clearReactorStorage } from "../../../../store/reactor";
import { useModal } from "../../modal.js";

export const DangerZone: React.FC<{ onRefresh: () => void }> = ({
  onRefresh,
}) => {
  const { t } = useTranslation();
  const drives = useDrives();
  const { showModal } = useModal();

  const handleDeleteDrive = async (drive: DocumentDriveDocument) => {
    await deleteDrive(drive.header.id);
    setSelectedDrive(undefined);
  };

  const handleClearStorage = () => {
    showModal("confirmationModal", {
      title: t("modals.connectSettings.clearStorage.confirmation.title"),
      body: t("modals.connectSettings.clearStorage.confirmation.body"),
      cancelLabel: t("common.cancel"),
      continueLabel: t(
        "modals.connectSettings.clearStorage.confirmation.clearButton",
      ),
      onContinue: () => {
        clearReactorStorage()
          .then(() => {
            // refreshes the page to reload default drive
            setSelectedDrive(undefined);
            setSelectedNode(undefined);
            onRefresh();
          })
          .catch(logger.error);
      },
      onCancel: () => showModal("settingsModal", { onRefresh }),
    });
  };

  return (
    <BaseDangerZone
      drives={drives ?? []}
      onDeleteDrive={handleDeleteDrive}
      onClearStorage={handleClearStorage}
    />
  );
};
