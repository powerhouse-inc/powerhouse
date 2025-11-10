import { toast } from "@powerhousedao/connect/services/toast";
import { ConnectDeleteDriveModal } from "@powerhousedao/design-system/connect";
import {
    closePHModal,
    deleteDrive,
    setSelectedDrive,
    useDriveById,
    useDrives,
    usePHModal,
} from "@powerhousedao/reactor-browser";
import { useTranslation } from "react-i18next";

export const DeleteDriveModal: React.FC = () => {
  const phModal = usePHModal();
  const open = phModal?.type === "deleteDrive";
  const driveId = open ? phModal.driveId : undefined;
  const [drive] = useDriveById(driveId);
  const drives = useDrives();
  if (!drive) {
    return null;
  }
  async function onDeleteDrive() {
    if (!driveId) {
      return;
    }
    await deleteDrive(driveId);

    setSelectedDrive(drives?.[0]);
    closePHModal();

    toast(t("notifications.deleteDriveSuccess"), {
      type: "connect-deleted",
    });
  }

  const { t } = useTranslation();

  return (
    <ConnectDeleteDriveModal
      open={open}
      driveName={drive.header.name}
      onCancel={closePHModal}
      header={t("modals.deleteDrive.title", { label: drive.header.name })}
      body={t("modals.deleteDrive.body")}
      inputPlaceholder={t("modals.deleteDrive.inputPlaceholder")}
      cancelLabel={t("common.cancel")}
      continueLabel={t("common.delete")}
      onContinue={() => onDeleteDrive()}
      onOpenChange={(status: boolean) => {
        if (!status) return closePHModal();
      }}
    />
  );
};
