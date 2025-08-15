import {
  type AddPublicDriveFormProps,
  AddRemoteDriveForm,
  type AddRemoteDriveInput,
  Divider,
} from "#connect";
import { type DivProps, Icon, Modal } from "#powerhouse";
import { type SharingType } from "document-drive";
import { type ComponentPropsWithoutRef } from "react";
import { twMerge } from "tailwind-merge";

type ModalProps = ComponentPropsWithoutRef<typeof Modal>;
export type AddRemoteDriveModal = {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSubmit: (data: AddRemoteDriveInput) => void;
  readonly sharingType: SharingType;
  readonly modalProps?: ModalProps;
  readonly containerProps?: DivProps;
} & Pick<AddPublicDriveFormProps, "requestPublicDrive">;
export function AddRemoteDriveModal(props: AddRemoteDriveModal) {
  const {
    open,
    onOpenChange,
    onSubmit,
    sharingType,
    modalProps,
    containerProps,
    requestPublicDrive,
  } = props;
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
          "min-w-[408px] max-w-[408px] rounded-2xl p-6",
          containerProps?.className,
        )}
      >
        <div className="flex justify-between">
          <h1 className="text-xl font-bold">Add drive</h1>
          <button
            className="flex size-8 items-center justify-center rounded-md bg-gray-100 text-gray-500 outline-none hover:text-gray-900"
            onClick={handleCancel}
            tabIndex={-1}
          >
            <Icon name="XmarkLight" size={24} />
          </button>
        </div>
        <Divider className="my-4" />
        <AddRemoteDriveForm
          onCancel={handleCancel}
          onSubmit={onSubmit}
          requestPublicDrive={requestPublicDrive}
          sharingType={sharingType}
        />
      </div>
    </Modal>
  );
}
