import { useArgs } from "@storybook/preview-api";
import type { Meta, StoryObj } from "@storybook/react";
import type { DocumentDriveDocument } from "document-drive";
import { DriveSettingsModal } from "./index.js";

const meta = {
  title: "Connect/Components/Drive Settings Modal",
  component: DriveSettingsModal,
} satisfies Meta<typeof DriveSettingsModal>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    drive: {
      header: {
        id: "1",
        name: "Drive 1",
      },
    } as DocumentDriveDocument,
    onChangeAvailableOffline() {},
    onRenameDrive() {},
    onChangeSharingType() {},
    onDeleteDrive() {},
    onOpenChange() {},
    sharingType: "LOCAL",
    availableOffline: true,
    open: true,
  },
  render: function Wrapper(args) {
    const [, setArgs] = useArgs<typeof args>();

    return (
      <div className="grid size-full place-items-center">
        <button
          className="rounded-lg bg-red-500 p-4 text-white"
          onClick={() => {
            setArgs({
              ...args,
              modalProps: {
                ...args.modalProps,
                open: true,
              },
            });
          }}
        >
          Open Modal
        </button>
        <DriveSettingsModal
          {...args}
          modalProps={{
            ...args.modalProps,
            onOpenChange: (open) => {
              setArgs({
                ...args,
                modalProps: {
                  ...args.modalProps,
                  open,
                },
              });
            },
          }}
        />
      </div>
    );
  },
};
