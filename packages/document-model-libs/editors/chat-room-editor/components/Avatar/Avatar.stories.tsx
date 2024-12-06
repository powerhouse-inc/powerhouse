import type { Meta, StoryObj } from "@storybook/react";

import { Avatar } from "./Avatar";

const meta: Meta<typeof Avatar> = {
  component: Avatar,
  title: "ChatRoom/Avatar",
  argTypes: {
    imgUrl: {
      control: "text",
    },
    userName: {
      control: "text",
    },
  },
};

export default meta;
type Story = StoryObj<typeof Avatar>;

export const Primary: Story = {
  args: {
    userName: "0x1234567890abcdef",
  },
};
