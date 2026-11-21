import type {
  Message as MessageType,
  ContentPart,
} from "document-models/chat-session";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
  ConversationEmptyState,
} from "./ai-elements/conversation.js";
import { MessageBubble } from "./MessageBubble.js";
import { TypingIndicator } from "./TypingIndicator.js";
import { MessageSquareIcon } from "lucide-react";
import { useMemo } from "react";

interface ConversationViewProps {
  messages: MessageType[];
  /** Agent is mid-turn (drives the typing indicator). */
  responding?: boolean;
}

export function ConversationView({
  messages,
  responding = false,
}: ConversationViewProps) {
  const toolResultMap = useMemo(() => {
    const map = new Map<string, ContentPart>();
    for (const msg of messages) {
      if (msg.role !== "TOOL") continue;
      for (const part of msg.content) {
        if (part.toolCallId) {
          map.set(part.toolCallId, part);
        }
      }
    }
    return map;
  }, [messages]);

  const visibleMessages = useMemo(() => {
    const ids = new Set<string>();
    for (const msg of messages) {
      if (msg.role !== "ASSISTANT") continue;
      for (const part of msg.content) {
        if (part.type === "TOOL_CALL" && part.toolCallId) {
          ids.add(part.toolCallId);
        }
      }
    }

    const visible = messages.filter((msg) => {
      if (msg.role !== "TOOL") return true;
      return !msg.content.every(
        (part) => part.toolCallId && ids.has(part.toolCallId),
      );
    });

    return visible;
  }, [messages]);

  const showTyping = responding;

  const lastVisible =
    visibleMessages.length > 0
      ? visibleMessages[visibleMessages.length - 1]
      : undefined;

  return (
    <Conversation className="flex-1">
      <ConversationContent className="mx-auto max-w-[1100px]">
        {visibleMessages.length === 0 ? (
          <ConversationEmptyState
            title="No messages yet"
            description="Type a message below to start the conversation"
            icon={<MessageSquareIcon className="size-8" />}
          />
        ) : (
          // Spacing is per-message (not a uniform container gap). Tool-only
          // messages cling to the assistant turn they belong to (tight gap),
          // grouping consecutive tools; prose / user messages keep the normal
          // gap-8 breathing room.
          visibleMessages.map((message, i) => {
            const prev = i > 0 ? visibleMessages[i - 1] : undefined;
            const tight =
              !!prev && prev.role !== "USER" && isToolMessage(message);
            // Only the first assistant/tool message of a turn (right after a user
            // message, or the very first message) shows the avatar; the rest of
            // the turn aligns under it without one.
            const showAvatar =
              (message.role === "ASSISTANT" || message.role === "TOOL") &&
              (!prev || prev.role === "USER");
            return (
              <div
                key={message.id}
                className={i === 0 ? undefined : tight ? "mt-2" : "mt-8"}
              >
                <MessageBubble
                  message={message}
                  toolResultMap={toolResultMap}
                  showAvatar={showAvatar}
                />
              </div>
            );
          })
        )}
        {showTyping && (
          <div
            className={
              !lastVisible
                ? undefined
                : lastVisible.role === "USER"
                  ? "mt-8"
                  : "mt-2"
            }
          >
            <TypingIndicator
              showAvatar={!lastVisible || lastVisible.role === "USER"}
            />
          </div>
        )}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}

/** A message that renders only tool UI (no prose); used to group consecutive tools tightly. */
function isToolMessage(message: MessageType): boolean {
  if (message.role === "TOOL") return true;
  if (message.role === "ASSISTANT")
    return (
      message.content.length > 0 &&
      message.content.every((part) => part.type === "TOOL_CALL")
    );
  return false;
}
