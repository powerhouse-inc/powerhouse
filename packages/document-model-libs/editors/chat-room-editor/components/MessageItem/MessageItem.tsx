/* eslint-disable react/jsx-max-depth */
/* eslint-disable react/jsx-no-bind */
/* eslint-disable react/jsx-props-no-spreading */
import { Message, MessageProps } from "../Message";
import { Avatar, AvatarProps } from "../Avatar";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from "@powerhousedao/design-system";

export type MessageItemProps = MessageProps & AvatarProps;

export const reactionMap = {
  cry: "😢",
  laughing: "😂",
  heart: "❤️",
  thumbsDown: "👎",
  thumbsUp: "👍",
};

export const MessageItem: React.FC<MessageItemProps> = (props) => {
  const { imgUrl, userName, isCurrentUser, ...messageProps } = props;
  const { disabled = false } = messageProps;

  const [isHovered, setIsHovered] = useState(false);
  const [open, setOpen] = useState(false);

  const onOpenChange = (openState: boolean) => {
    setOpen(openState);
    if (!openState) {
      setIsHovered(false);
    }
  };

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => !open && setIsHovered(false)}
      style={{
        display: "flex",
        gap: "2px",
        alignItems: "flex-end",
        flexDirection: isCurrentUser ? "row-reverse" : "row",
        marginLeft: isCurrentUser ? "80px" : "0px",
        marginRight: isCurrentUser ? "0px" : "80px",
      }}
    >
      <Avatar imgUrl={imgUrl} userName={userName} />
      <DropdownMenu dir="rtl" onOpenChange={onOpenChange} open={open}>
        <Message
          isCurrentUser={isCurrentUser}
          userName={userName}
          {...messageProps}
        />

        <DropdownMenuTrigger asChild onClick={() => setOpen(true)}>
          <div
            style={{
              fontSize: "26px",
              cursor: "pointer",
              visibility: !disabled && isHovered ? "visible" : "hidden",
            }}
          >
            🫥
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="top"
          style={{
            fontSize: "26px",
            display: "flex",
            gap: "8px",
            backgroundColor: "white",
            padding: "8px",
            borderRadius: "8px",
            paddingTop: "2px",
            paddingBottom: "2px",
            boxShadow: "0px 4px 8px rgba(0, 0, 0, 0.1)",
          }}
        >
          {Object.entries(reactionMap).map(([key, emoji]) => (
            <DropdownMenuItem
              key={key}
              onClick={() =>
                messageProps.onClickReaction
                  ? messageProps.onClickReaction({
                      emoji,
                      type: key,
                      messageId: messageProps.id,
                      reactedBy: [],
                    })
                  : null
              }
              style={{
                outline: "none",
                cursor: "pointer",
              }}
            >
              {emoji}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
