import type { Meta, StoryObj } from "@storybook/react";

import { TextInput } from "./TextInput";

const meta: Meta<typeof TextInput> = {
  component: TextInput,
  title: "ChatRoom/TextInput",
  argTypes: {
    onSendMessage: { action: "sendMessage" },
    disabled: { control: "boolean" },
  },
};

export default meta;
type Story = StoryObj<typeof TextInput>;

export const Primary: Story = {
  args: {
    disabled: false,
    onSendMessage: (message) => console.log("onSendMessage", message),
  },
};
