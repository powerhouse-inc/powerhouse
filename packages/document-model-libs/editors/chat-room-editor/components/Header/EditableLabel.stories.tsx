import type { Meta, StoryObj } from "@storybook/react";

import { EditableLabel } from "./EditableLabel";

const meta: Meta<typeof EditableLabel> = {
  component: EditableLabel,
  title: "ChatRoom/EditableLabel",
  argTypes: {
    label: { control: "text" },
    style: { control: "object" },
    onSubmit: { action: "onSubmit" },
  },
};

export default meta;
type Story = StoryObj<typeof EditableLabel>;

export const Primary: Story = {
  args: {
    onSubmit: (label: string) => console.log("Submitted label:", label),
    label: "Chat Room",
    style: {
      fontSize: "18px",
      fontWeight: "bold",
      margin: 0,
    },
  },
};
