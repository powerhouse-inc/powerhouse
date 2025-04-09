import type { Meta, StoryObj } from "@storybook/react";
import { ConnectUpgradeDriveModal } from "./upgrade-drive-modal.js";

const meta: Meta<typeof ConnectUpgradeDriveModal> = {
  title: "Connect/Components/Modal/UpgradeDriveModal",
  component: ConnectUpgradeDriveModal,
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    open: true,
    header: "Upgrade to cloud drive",
    body: "You are moving files from a private to a shared drive. These files will become accessible to others in the shared drive.Do you want to proceed?",
    cancelLabel: "Cancel",
    continueLabel: "Continue",
  },
};
