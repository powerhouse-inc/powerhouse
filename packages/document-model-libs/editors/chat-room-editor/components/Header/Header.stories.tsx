import type { Meta, StoryObj } from "@storybook/react";

import { Header } from "./Header";

const meta: Meta<typeof Header> = {
  component: Header,
  title: "ChatRoom/Header",
  argTypes: {
    title: { control: "text" },
    description: { control: "text" },
    onTitleSubmit: { action: "onTitleSubmit" },
    onDescriptionSubmit: { action: "onDescriptionSubmit" },
  },
};

export default meta;
type Story = StoryObj<typeof Header>;

export const Primary: Story = {
  args: {
    title: "Chat Room",
    description: "Welcome to the chat room",
    onTitleSubmit: (title: string) => console.log("Submitted title:", title),
    onDescriptionSubmit: (description: string) =>
      console.log("Submitted description:", description),
  },
};
