import { DriveSettingsModal as ConnectDriveSettingsModal } from "@powerhousedao/design-system/connect";
import {
    closePHModal,
    getDriveAvailableOffline,
    getDriveSharingType,
    renameDrive,
    setDriveAvailableOffline,
    setDriveSharingType,
    showPHModal,
    useDriveById,
    usePHModal,
} from "@powerhousedao/reactor-browser";
import type { DocumentDriveDocument, SharingType } from "document-drive";

export function DriveSettingsModal() {
  const phModal = usePHModal();
  const open = phModal?.type === "driveSettings";
  const driveId = open ? phModal.driveId : undefined;
  const [drive] = useDriveById(driveId);
  const sharingType = getDriveSharingType(drive);
  const availableOffline = getDriveAvailableOffline(drive);

  if (!driveId || !drive) {
    return null;
  }

  async function onRenameDrive(drive: DocumentDriveDocument, newName: string) {
    await renameDrive(drive.header.id, newName);
  }

  async function onChangeSharingType(
    drive: DocumentDriveDocument,
    newSharingType: SharingType,
  ) {
    await setDriveSharingType(drive.header.id, newSharingType);
  }

  async function onChangeAvailableOffline(
    drive: DocumentDriveDocument,
    newAvailableOffline: boolean,
  ) {
    await setDriveAvailableOffline(drive.header.id, newAvailableOffline);
  }

  return (
    <ConnectDriveSettingsModal
      drive={drive}
      sharingType={sharingType ?? "LOCAL"}
      availableOffline={availableOffline}
      open={open}
      onRenameDrive={onRenameDrive}
      onDeleteDrive={() => showPHModal({ type: "deleteDrive", driveId })}
      onChangeAvailableOffline={onChangeAvailableOffline}
      onChangeSharingType={onChangeSharingType}
      onOpenChange={(status) => {
        if (!status) return closePHModal();
      }}
    />
  );
}
