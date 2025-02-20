import {
  AddLocalDriveForm,
  AddLocalDriveInput,
  AddPublicDriveFormProps,
  AddRemoteDriveForm,
  AddRemoteDriveInput,
  TabContent,
  Tabs,
} from "@/connect";
import { DivProps, Modal } from "@/powerhouse";
import { ComponentPropsWithoutRef } from "react";
import { twMerge } from "tailwind-merge";

type ModalProps = ComponentPropsWithoutRef<typeof Modal>;
export type AddDriveModalProps = {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onAddRemoteDrive: (data: AddRemoteDriveInput) => void;
  readonly onAddLocalDrive: (data: AddLocalDriveInput) => void;
  readonly modalProps?: ModalProps;
  readonly containerProps?: DivProps;
} & Pick<AddPublicDriveFormProps, "requestPublicDrive">;
export function AddDriveModal(props: AddDriveModalProps) {
  function handleCancel() {
    onOpenChange(false);
  }
  const {
    open,
    onOpenChange,
    onAddRemoteDrive,
    onAddLocalDrive,
    requestPublicDrive,
    modalProps,
    containerProps,
  } = props;
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
          "w-[408px] rounded-2xl p-6",
          containerProps?.className,
        )}
      >
        <Tabs>
          <TabContent label="Create Drive" description="Create a new drive">
            <AddLocalDriveForm
              onCancel={handleCancel}
              onSubmit={onAddLocalDrive}
            />
          </TabContent>
          <TabContent label="Add Drive" description="Add a drive">
            <AddRemoteDriveForm
              sharingType="PUBLIC"
              onSubmit={onAddRemoteDrive}
              onCancel={handleCancel}
              requestPublicDrive={requestPublicDrive}
            />
          </TabContent>
          <TabContent label="New Shortcut" description="Create a new shortcut">
            test
          </TabContent>
        </Tabs>
      </div>
    </Modal>
  );
}
