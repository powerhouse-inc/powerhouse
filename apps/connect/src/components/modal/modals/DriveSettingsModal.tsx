import { DriveSettingsModal as ConnectDriveSettingsModal } from "@powerhousedao/design-system";
import {
  useDriveAvailableOffline,
  useDriveSharingType,
} from "@powerhousedao/reactor-browser";
import type { DocumentDriveDocument, SharingType } from "document-drive";

type Props = {
  drive: DocumentDriveDocument;
  open: boolean;
  onRenameDrive: (drive: DocumentDriveDocument, newName: string) => void;
  onDeleteDrive: (drive: DocumentDriveDocument) => void;
  onChangeSharingType: (
    drive: DocumentDriveDocument,
    newSharingType: SharingType,
  ) => void;
  onChangeAvailableOffline: (
    drive: DocumentDriveDocument,
    newAvailableOffline: boolean,
  ) => void;
  onClose: () => void;
};

export function DriveSettingsModal(props: Props) {
  const {
    drive,
    open,
    onRenameDrive,
    onDeleteDrive,
    onChangeAvailableOffline,
    onChangeSharingType,
    onClose,
  } = props;
  const sharingType = useDriveSharingType(drive.header.id);
  const availableOffline = useDriveAvailableOffline(drive.header.id);

  return (
    <ConnectDriveSettingsModal
      drive={drive}
      sharingType={sharingType ?? "LOCAL"}
      availableOffline={availableOffline}
      open={open}
      onRenameDrive={onRenameDrive}
      onDeleteDrive={onDeleteDrive}
      onChangeAvailableOffline={onChangeAvailableOffline}
      onChangeSharingType={onChangeSharingType}
      onOpenChange={(status) => {
        if (!status) return onClose();
      }}
    />
  );
}
