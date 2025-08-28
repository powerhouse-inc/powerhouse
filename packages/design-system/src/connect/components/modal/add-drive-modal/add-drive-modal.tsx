import {
  AddLocalDriveForm,
  type AddLocalDriveInput,
  AddRemoteDriveForm,
  type AddRemoteDriveInput,
  type DivProps,
  Modal,
  TabContent,
  Tabs,
} from "@powerhousedao/design-system";
import { type App } from "document-model";
import { type ComponentPropsWithoutRef } from "react";
import { twMerge } from "tailwind-merge";

type ModalProps = ComponentPropsWithoutRef<typeof Modal>;
export type AddDriveModalProps = {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onAddRemoteDrive: (data: AddRemoteDriveInput) => void;
  readonly onAddLocalDrive: (data: AddLocalDriveInput) => void;
  readonly modalProps?: ModalProps;
  readonly containerProps?: DivProps;
  readonly requestPublicDrive: (
    url: string,
  ) => Promise<{ id: string; name: string }>;
  readonly appOptions: App[];
};
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
        <Tabs defaultValue="Create Drive">
          <TabContent label="Create Drive" description="Create a new drive">
            <AddLocalDriveForm
              onCancel={handleCancel}
              onSubmit={onAddLocalDrive}
              appOptions={props.appOptions}
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
          <TabContent
            label="New Shortcut"
            description="Create a new shortcut"
            disabled
          >
            test
          </TabContent>
        </Tabs>
      </div>
    </Modal>
  );
}
