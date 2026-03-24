import { DriveSettingsModal as ConnectDriveSettingsModal } from "@powerhousedao/design-system/connect";
import {
  closePHModal,
  driveCollectionId,
  renameDrive,
  setDriveAvailableOffline,
  setDriveSharingType,
  showPHModal,
  useDriveById,
  usePHModal,
  useSyncList,
} from "@powerhousedao/reactor-browser";
import type { DocumentDriveDocument } from "@powerhousedao/shared/document-drive";
import type { SharingType } from "@powerhousedao/shared/document-drive";
import { useMemo } from "react";

export function DriveSettingsModal() {
  const phModal = usePHModal();
  const open = phModal?.type === "driveSettings";
  const driveId = open ? phModal.driveId : undefined;
  const [drive] = useDriveById(driveId);
  const remotes = useSyncList();

  const isRemoteDrive = useMemo(() => {
    return remotes.some(
      (remote) =>
        remote.collectionId === driveCollectionId("main", drive.header.id),
    );
  }, [remotes, drive]);

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
      sharingType={isRemoteDrive ? "PUBLIC" : "LOCAL"}
      availableOffline={!isRemoteDrive}
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
