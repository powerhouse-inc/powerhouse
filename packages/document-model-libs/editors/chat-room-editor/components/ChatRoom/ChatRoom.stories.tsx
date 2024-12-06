/* eslint-disable react/jsx-no-bind */
/* eslint-disable react/jsx-props-no-spreading */
import type { Meta, StoryObj } from "@storybook/react";

import { ChatRoom, ChatRoomProps } from "./ChatRoom";
import { useState } from "react";

const meta: Meta<typeof ChatRoom> = {
  component: ChatRoom,
  title: "ChatRoom/ChatRoomComponent",
  argTypes: {
    title: { control: "text" },
    description: { control: "text" },
    onSendMessage: { action: "sendMessage" },
    messages: { control: "object" },
    disabled: { control: "boolean" },
  },
};

export default meta;
type Story = StoryObj<typeof ChatRoom>;

const ChatRoomWrapper = (props: ChatRoomProps) => {
  const { messages: initialMessages, ...chatRoomProps } = props;

  const [messages, setMessages] = useState(initialMessages || []);

  const onSendMessage = (message: string) => {
    const newMessage = {
      id: `${messages.length + 1}`,
      userName: "Super User",
      message,
      timestamp: new Date().toISOString(),
      isCurrentUser: true,
    };

    setMessages([...messages, newMessage]);
  };

  return (
    <div style={{ height: 600 }}>
      <ChatRoom
        {...chatRoomProps}
        messages={messages}
        onSendMessage={onSendMessage}
      />
    </div>
  );
};

export const Primary: Story = {
  args: {
    title: "Chat Room",
    description: "Welcome to the chat room",
    onSendMessage: (message) => console.log("onSendMessage", message),
    onClickReaction: (reaction) => console.log("onClickReaction", reaction),
    disabled: false,
    messages: [
      {
        id: "1",
        userName: "0x1234567890abcdef",
        message: "Hello, World!",
        timestamp: new Date().toISOString(),
        isCurrentUser: false,
      },
      {
        id: "2",
        userName: "Super User",
        message: "Hello, Hello guys!!",
        timestamp: new Date().toISOString(),
        isCurrentUser: true,
      },
      {
        id: "3",
        userName: "John Doe",
        message: "What's up?",
        timestamp: new Date().toISOString(),
        isCurrentUser: false,
      },
      {
        id: "4",
        userName: "Clau_s",
        message: "Hello everyone!",
        timestamp: new Date().toISOString(),
        isCurrentUser: false,
      },
      {
        id: "5",
        userName: "Bobby",
        message: "hello hello! :)",
        timestamp: new Date().toISOString(),
        isCurrentUser: false,
      },
      {
        id: "6",
        userName: "Super User",
        message:
          "The idea of this chat room is to share ideas and have fun, so feel free to share your thoughts and make new friends!",
        timestamp: new Date().toISOString(),
        isCurrentUser: true,
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
      },
      {
        id: "7",
        userName: "John Doe",
        message: "I like the idea!",
        timestamp: new Date().toISOString(),
        isCurrentUser: false,
      },
      {
        id: "8",
        userName: "Clau_s",
        message: "I'm in!",
        timestamp: new Date().toISOString(),
        isCurrentUser: false,
        reactions: [
          {
            emoji: "🔥",
            type: "fire",
            reactedBy: ["0x1234567890"],
          },
        ],
      },
      {
        id: "9",
        userName: "Bobby",
        message: "I'm in too!",
        timestamp: new Date().toISOString(),
        isCurrentUser: false,
      },
    ],
  },
  render: ChatRoomWrapper,
};
