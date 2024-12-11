/* eslint-disable react/jsx-props-no-spreading */
import { Header } from "../Header";
import { TextInput } from "../TextInput";
import { MessageItem, MessageItemProps } from "../MessageItem";
import { MessageProps } from "../Message";
import { useRef, useEffect } from "react";

export interface ChatRoomProps {
  onSendMessage: (message: string) => void;
  title: string;
  description?: string;
  onClickReaction?: MessageProps["onClickReaction"];
  messages?: Omit<MessageItemProps, "onClickReaction">[];
  disabled?: boolean;
  onSubmitTitle?: (title: string) => void;
  onSubmitDescription?: (description: string) => void;
}

export const ChatRoom: React.FC<ChatRoomProps> = (props) => {
  const {
    onSendMessage,
    title,
    description,
    disabled = false,
    messages = [],
    onSubmitTitle,
    onSubmitDescription,
    onClickReaction = () => {},
  } = props;

  const messagesContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scrollHeight = messagesContainerRef.current?.scrollHeight || 0;
    const clientHeight = messagesContainerRef.current?.clientHeight || 0;
    const scrollTop = messagesContainerRef.current?.scrollTop || 0;

    const isAtBottom = scrollHeight - (clientHeight + 100) <= scrollTop;

    if (isAtBottom) {
      messagesContainerRef.current?.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, messagesContainerRef]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        flex: 1,
      }}
    >
      <div>
        <Header
          description={description}
          onDescriptionSubmit={onSubmitDescription}
          onTitleSubmit={onSubmitTitle}
          title={title}
        />
      </div>
      <div
        ref={messagesContainerRef}
        style={{
          display: "flex",
          flex: 1,
          flexDirection: "column",
          gap: "8px",
          overflowY: "auto",
          marginTop: "20px",
          marginBottom: "20px",
        }}
      >
        {messages.map((message) => (
          <MessageItem
            key={message.id}
            {...message}
            disabled={disabled}
            onClickReaction={onClickReaction}
          />
        ))}
      </div>
      {disabled ? (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <span
            style={{
              padding: "8px",
              paddingTop: "4px",
              paddingBottom: "4px",
              minWidth: "200px",
              backgroundColor: "#f0f0f0",
              borderRadius: "8px",
            }}
          >
            You need to login to start chatting ⚠️
          </span>
        </div>
      ) : (
        <div>
          <TextInput onSendMessage={onSendMessage} />
        </div>
      )}
    </div>
  );
};
