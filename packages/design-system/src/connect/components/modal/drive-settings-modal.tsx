import {
  Divider,
  DriveSettingsForm,
  type DriveSettingsFormSubmitHandler,
  type SharingType,
} from "#connect";
import { Icon, Modal } from "#powerhouse";
import { useCallback, type ComponentPropsWithoutRef } from "react";

type Props = ComponentPropsWithoutRef<typeof Modal> & {
  driveId: string;
  name: string;
  sharingType: SharingType;
  availableOffline: boolean;
  closeModal: () => void;
  onDeleteDrive: (driveId: string) => void;
  onRenameDrive: (driveId: string, name: string) => void;
  onChangeSharingType: (driveId: string, sharingType: SharingType) => void;
  onChangeAvailableOffline: (
    driveId: string,
    availableOffline: boolean,
  ) => void;
};
export function DriveSettingsModal(props: Props) {
  const {
    open,
    driveId,
    name,
    sharingType,
    availableOffline,
    closeModal,
    onOpenChange,
    onDeleteDrive,
    onRenameDrive,
    onChangeSharingType,
    onChangeAvailableOffline,
  } = props;

  const onSubmit: DriveSettingsFormSubmitHandler = useCallback(
    (data) => {
      if (data.name !== name) {
        onRenameDrive(driveId, data.name);
      }
      if (data.sharingType !== sharingType) {
        onChangeSharingType(driveId, data.sharingType);
      }
      if (data.availableOffline !== availableOffline) {
        onChangeAvailableOffline(driveId, data.availableOffline);
      }
      closeModal();
    },
    [
      name,
      driveId,
      sharingType,
      availableOffline,
      onChangeSharingType,
      onRenameDrive,
      closeModal,
    ],
  );

  return (
    <Modal
      contentProps={{
        className: "rounded-2xl",
      }}
      onOpenChange={onOpenChange}
      open={open}
    >
      <div className="max-w-[408px] rounded-2xl p-6">
        <div className="flex justify-between">
          <h1 className="text-xl font-bold">Drive settings</h1>
          <button
            className="flex size-8 items-center justify-center rounded-md bg-gray-100 text-gray-500 outline-none hover:text-gray-900"
            onClick={closeModal}
            tabIndex={-1}
          >
            <Icon name="XmarkLight" size={24} />
          </button>
        </div>
        <Divider className="my-4" />
        <DriveSettingsForm
          closeModal={closeModal}
          driveId={driveId}
          onDeleteDrive={onDeleteDrive}
          onSubmit={onSubmit}
          name={name}
          sharingType={sharingType}
          availableOffline={availableOffline}
        />
      </div>
    </Modal>
  );
}
