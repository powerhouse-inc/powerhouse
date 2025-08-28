import type { Meta, StoryObj } from "@storybook/react";
import { DocId } from "./doc-id.js";

const meta = {
  title: "Connect/Components/Revision History/Header/DocId",
  component: DocId,
} satisfies Meta<typeof DocId>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    docId: "ulIcp/LL8qjML1kOWchprJ4oAJM=",
  },
};
