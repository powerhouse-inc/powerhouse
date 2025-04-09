import type { Meta, StoryObj } from "@storybook/react";
import { ConnectDeleteDriveModal } from "./delete-drive-modal.js";

const meta: Meta<typeof ConnectDeleteDriveModal> = {
  title: "Connect/Components/Modal/ConnectDeleteDriveModal",
  component: ConnectDeleteDriveModal,
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    open: true,
    header: "Delete “Powerhouse” drive?",
    body: "Are you sure you want to delete this drive?  All files and subfolders within it will be removed. Do you want to proceed?",
    cancelLabel: "Cancel",
    continueLabel: "Delete",
    inputPlaceholder: "Enter drive name...",
    driveName: "Powerhouse",
  },
};
