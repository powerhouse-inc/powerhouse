import { AddLocalDriveForm, type AddLocalDriveInput, Divider } from "@/connect";
import { type DivProps, Icon, Modal } from "#powerhouse";
import { type App } from "document-model";
import { type ComponentPropsWithoutRef } from "react";
import { twMerge } from "tailwind-merge";

type ModalProps = ComponentPropsWithoutRef<typeof Modal>;
export type AddLocalDriveModal = {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSubmit: (data: AddLocalDriveInput) => void;
  readonly modalProps?: ModalProps;
  readonly containerProps?: DivProps;
  readonly appOptions: App[];
};
export function AddLocalDriveModal(props: AddLocalDriveModal) {
  const {
    open,
    onOpenChange,
    onSubmit,
    modalProps,
    containerProps,
    appOptions,
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
          "max-w-[408px] rounded-2xl p-6",
          containerProps?.className,
        )}
      >
        <div className="flex justify-between">
          <h1 className="text-xl font-bold">Create new drive </h1>
          <button
            className="flex size-8 items-center justify-center rounded-md bg-gray-100 text-gray-500 outline-none hover:text-gray-900"
            onClick={handleCancel}
            tabIndex={-1}
          >
            <Icon name="XmarkLight" size={24} />
          </button>
        </div>
        <Divider className="my-4" />
        <AddLocalDriveForm
          onCancel={handleCancel}
          onSubmit={onSubmit}
          appOptions={appOptions}
        />
      </div>
    </Modal>
  );
}
