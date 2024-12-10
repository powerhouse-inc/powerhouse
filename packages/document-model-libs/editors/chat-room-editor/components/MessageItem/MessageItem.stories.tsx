import type { Meta, StoryObj } from "@storybook/react";

import { MessageItem } from "./MessageItem";

const meta: Meta<typeof MessageItem> = {
  component: MessageItem,
  title: "ChatRoom/MessageItem",
  argTypes: {
    id: { control: "text" },
    message: { control: "text" },
    userName: { control: "text" },
    timestamp: { control: "text" },
    reactions: { control: "object" },
    isCurrentUser: { control: "boolean" },
    onClickReaction: { action: "clicked" },
    imgUrl: { control: "text" },
    disabled: { control: "boolean" },
  },
};

export default meta;
type Story = StoryObj<typeof MessageItem>;

export const Primary: Story = {
  args: {
    id: "0x1234567890abcdef",
    disabled: false,
    message:
      "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua",
    userName: "0x1234567890abcdef",
    timestamp: new Date().toISOString(),
    reactions: [
      {
        emoji: "👍",
        type: "thumbsUp",
        reactedBy: ["0x1234567890", "0x0987654321", "0x1234567891"],
      },
      {
        emoji: "🔥",
        type: "fire",
        reactedBy: ["0x1234567890"],
      },
      {
        emoji: "😂",
        type: "laughing",
        reactedBy: ["0x1234567890", "0x0987654321"],
      },
      {
        emoji: "🚀",
        type: "rocket",
        reactedBy: [
          "0x1234567890",
          "0x0987654321",
          "0x1234567891",
          "0x0987654322",
          "0x1234567892",
        ],
      },
    ],
    isCurrentUser: true,
    onClickReaction: (reaction) => console.log("reaction clicked", reaction),
  },
};
