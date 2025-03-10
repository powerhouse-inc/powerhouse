import type { Meta, StoryObj } from "@storybook/react";
import { ConnectDeleteItemModal } from "./delete-item-modal.js";

const meta: Meta<typeof ConnectDeleteItemModal> = {
  title: "Connect/Components/Modal/DeleteItemModal",
  component: ConnectDeleteItemModal,
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    open: true,
    header: "Delete “Ecosystem Actors” folder?",
    body: "Are you sure you want to delete this folder?  All files and subfolders within it will be removed.",
    cancelLabel: "Cancel",
    deleteLabel: "Delete",
  },
};
