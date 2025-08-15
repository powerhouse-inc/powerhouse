import {
  Divider,
  DriveSettingsForm,
  type DriveSettingsFormSubmitHandler,
} from "#connect";
import { Icon, Modal, type DivProps } from "#powerhouse";
import { type DocumentDriveDocument, type SharingType } from "document-drive";
import { type ComponentPropsWithoutRef } from "react";
import { twMerge } from "tailwind-merge";

type ModalProps = ComponentPropsWithoutRef<typeof Modal>;

export type DriveSettingsModalProps = {
  drive: DocumentDriveDocument;
  sharingType: SharingType;
  availableOffline: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
  modalProps?: ModalProps;
  containerProps?: DivProps;
};
export function DriveSettingsModal(props: DriveSettingsModalProps) {
  const {
    drive,
    open,
    sharingType,
    availableOffline,
    onOpenChange,
    onDeleteDrive,
    onRenameDrive,
    onChangeSharingType,
    onChangeAvailableOffline,
    modalProps,
    containerProps,
  } = props;

  const onSubmit: DriveSettingsFormSubmitHandler = (data) => {
    if (data.name !== drive.header.name) {
      onRenameDrive(drive, data.name);
    }
    if (data.sharingType !== sharingType) {
      onChangeSharingType(drive, data.sharingType);
    }
    if (data.availableOffline !== availableOffline) {
      onChangeAvailableOffline(drive, data.availableOffline);
    }
    onOpenChange(false);
  };

  function handleDeleteDrive() {
    onDeleteDrive(drive);
    onOpenChange(false);
  }

  function handleCancel() {
    onOpenChange(false);
  }

  return (
    <Modal
      {...modalProps}
      contentProps={{
        className: "rounded-2xl",
      }}
      onOpenChange={onOpenChange}
      open={open}
    >
      <div
        {...containerProps}
        className={twMerge(
          "max-w-[408px] rounded-2xl p-6",
          containerProps?.className,
        )}
      >
        <div className="flex justify-between">
          <h1 className="text-xl font-bold">Drive settings</h1>
          <button
            className="flex size-8 items-center justify-center rounded-md bg-gray-100 text-gray-500 outline-none hover:text-gray-900"
            onClick={handleCancel}
            tabIndex={-1}
          >
            <Icon name="XmarkLight" size={24} />
          </button>
        </div>
        <Divider className="my-4" />
        <DriveSettingsForm
          handleCancel={handleCancel}
          handleDeleteDrive={handleDeleteDrive}
          onSubmit={onSubmit}
          drive={drive}
          sharingType={sharingType}
          availableOffline={availableOffline}
        />
      </div>
    </Modal>
  );
}
