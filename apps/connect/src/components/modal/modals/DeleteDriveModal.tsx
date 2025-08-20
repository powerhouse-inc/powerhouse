import { ConnectDeleteDriveModal } from "@powerhousedao/design-system";
import { type DocumentDriveDocument } from "document-drive";
import { useTranslation } from "react-i18next";

export interface DeleteDriveModalProps {
  drive: DocumentDriveDocument;
  open: boolean;
  onClose: () => void;
  onDelete: (closeModal: () => void) => void;
}

export const DeleteDriveModal: React.FC<DeleteDriveModalProps> = (props) => {
  const { open, onClose, drive, onDelete } = props;

  const { t } = useTranslation();

  return (
    <ConnectDeleteDriveModal
      open={open}
      driveName={drive.header.name}
      onCancel={onClose}
      header={t("modals.deleteDrive.title", { label: drive.header.name })}
      body={t("modals.deleteDrive.body")}
      inputPlaceholder={t("modals.deleteDrive.inputPlaceholder")}
      cancelLabel={t("common.cancel")}
      continueLabel={t("common.delete")}
      onContinue={() => onDelete(onClose)}
      onOpenChange={(status: boolean) => {
        if (!status) return onClose();
      }}
    />
  );
};
