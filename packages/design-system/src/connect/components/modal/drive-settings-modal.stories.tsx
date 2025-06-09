import { useArgs } from "@storybook/preview-api";
import { type Meta, type StoryObj } from "@storybook/react";
import { DriveSettingsModal } from "./index.js";

const meta = {
  title: "Connect/Components/Drive Settings Modal",
  component: DriveSettingsModal,
} satisfies Meta<typeof DriveSettingsModal>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    driveId: "drive-id",
    name: "Drive Name",
    sharingType: "LOCAL",
    availableOffline: true,
    onChangeAvailableOffline: () => {},
    onRenameDrive: () => {},
    onChangeSharingType: () => {},
    onDeleteDrive: () => {},
    onOpenChange: () => {},
    open: true,
    closeModal: () => {},
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
              open: true,
            });
          }}
        >
          Open Modal
        </button>
        <DriveSettingsModal
          {...args}
          onOpenChange={(open) => {
            setArgs({
              ...args,
              open,
            });
          }}
        />
      </div>
    );
  },
};
