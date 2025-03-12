import type { Meta, StoryObj } from "@storybook/react";
import { ConnectConfirmationModal } from "./confirmation-modal.js";

const meta: Meta<typeof ConnectConfirmationModal> = {
  title: "Connect/Components/Modal/ConnectConfirmationModal",
  component: ConnectConfirmationModal,
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    open: true,
    header: "Title",
    body: "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua",
    cancelLabel: "Cancel",
    continueLabel: "Continue",
  },
};
