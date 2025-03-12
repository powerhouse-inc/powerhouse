import type { Meta, StoryObj } from "@storybook/react";
import { CreateDocumentModal } from "./create-document-modal.js";

const meta: Meta<typeof CreateDocumentModal> = {
  title: "Connect/Components/Modal/Create Document Modal",
  component: CreateDocumentModal,
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    open: true,
  },
};
