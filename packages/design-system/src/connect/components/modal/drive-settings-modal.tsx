import {
  Divider,
  DriveSettingsForm,
  type DriveSettingsFormSubmitHandler,
  type SharingType,
  type UiDriveNode,
} from "@/connect";
import { type DivProps, Icon, Modal } from "@/powerhouse";
import { type ComponentPropsWithoutRef } from "react";
import { twMerge } from "tailwind-merge";

type ModalProps = ComponentPropsWithoutRef<typeof Modal>;

export type DriveSettingsModalProps = {
  readonly uiDriveNode: UiDriveNode;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onRenameDrive: (uiDriveNode: UiDriveNode, newName: string) => void;
  readonly onDeleteDrive: (uiDriveNode: UiDriveNode) => void;
  readonly onChangeSharingType: (
    uiDriveNode: UiDriveNode,
    newSharingType: SharingType,
  ) => void;
  readonly onChangeAvailableOffline: (
    uiDriveNode: UiDriveNode,
    newAvailableOffline: boolean,
  ) => void;
  readonly modalProps?: ModalProps;
  readonly containerProps?: DivProps;
};
export function DriveSettingsModal(props: DriveSettingsModalProps) {
  const {
    uiDriveNode,
    open,
    onOpenChange,
    onDeleteDrive,
    onRenameDrive,
    onChangeSharingType,
    onChangeAvailableOffline,
    modalProps,
    containerProps,
  } = props;

  const onSubmit: DriveSettingsFormSubmitHandler = (data) => {
    if (data.name !== uiDriveNode.name) {
      onRenameDrive(uiDriveNode, data.name);
    }
    if (data.sharingType !== uiDriveNode.sharingType) {
      onChangeSharingType(uiDriveNode, data.sharingType);
    }
    if (data.availableOffline !== uiDriveNode.availableOffline) {
      onChangeAvailableOffline(uiDriveNode, data.availableOffline);
    }
    onOpenChange(false);
  };

  function handleDeleteDrive() {
    onDeleteDrive(uiDriveNode);
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
          uiDriveNode={uiDriveNode}
        />
      </div>
    </Modal>
  );
}
