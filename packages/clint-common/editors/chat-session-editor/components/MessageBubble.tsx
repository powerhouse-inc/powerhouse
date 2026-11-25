import type {
  Message as MessageType,
  ContentPart,
} from "document-models/chat-session";
import { Message, MessageContent } from "./ai-elements/message.js";
import { ContentPartRenderer } from "./ContentPartRenderer.js";
import { BotIcon, UserIcon, TerminalIcon, ShieldIcon } from "lucide-react";
import type { ReactNode } from "react";
import { NOT_PICKED_UP_AFTER_MS } from "../lib/turn-state.js";
import { RetryButton, useChatActions, useElapsed } from "./chat-actions.js";

interface MessageBubbleProps {
  message: MessageType;
  toolResultMap: Map<string, ContentPart>;
  /** Show the assistant/tool avatar — only the first message of an assistant turn. */
  showAvatar?: boolean;
}

export function MessageBubble({
  message,
  toolResultMap,
  showAvatar = true,
}: MessageBubbleProps) {
  switch (message.role) {
    case "SYSTEM":
      return <SystemMessageBanner message={message} />;
    case "USER":
      return <UserMessage message={message} />;
    case "ASSISTANT":
      return (
        <AssistantMessage
          message={message}
          toolResultMap={toolResultMap}
          showAvatar={showAvatar}
        />
      );
    case "TOOL":
      return <ToolMessage message={message} showAvatar={showAvatar} />;
    default:
      return null;
  }
}

/** Avatar circle, or an equal-width spacer so turn content stays aligned. */
function AvatarSlot({
  show,
  className,
  children,
}: {
  show: boolean;
  className: string;
  children: ReactNode;
}) {
  if (!show) return <div className="size-7 shrink-0" aria-hidden />;
  return <div className={className}>{children}</div>;
}

function SystemMessageBanner({ message }: { message: MessageType }) {
  const text = message.content[0]?.text;
  if (!text) return null;

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        <ShieldIcon className="mt-0.5 size-3.5 shrink-0" />
        <div className="min-w-0 whitespace-pre-wrap break-words">{text}</div>
      </div>
    </div>
  );
}

function UserMessage({ message }: { message: MessageType }) {
  return (
    <Message from="user">
      <div className="flex items-start justify-end gap-2">
        <MessageContent>
          {message.content.map((part) => (
            <ContentPartRenderer key={part.id} part={part} />
          ))}
        </MessageContent>
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <UserIcon className="size-3.5" />
        </div>
      </div>
      <DeliveryStatus message={message} />
    </Message>
  );
}

function AssistantMessage({
  message,
  toolResultMap,
  showAvatar,
}: {
  message: MessageType;
  toolResultMap: Map<string, ContentPart>;
  showAvatar: boolean;
}) {
  return (
    <Message from="assistant">
      <div className="flex items-start gap-2">
        <AvatarSlot
          show={showAvatar}
          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground"
        >
          <BotIcon className="size-3.5" />
        </AvatarSlot>
        <MessageContent>
          {message.content.map((part) => {
            const linkedResult =
              part.type === "TOOL_CALL" && part.toolCallId
                ? toolResultMap.get(part.toolCallId)
                : undefined;
            return (
              <ContentPartRenderer
                key={part.id}
                part={part}
                linkedResult={linkedResult}
              />
            );
          })}
        </MessageContent>
      </div>
      <FailureActions message={message} />
      {message.usage && (
        <div className="ml-9 text-xs text-muted-foreground">
          {message.usage.totalTokens != null && (
            <span>{message.usage.totalTokens} tokens</span>
          )}
          {message.usage.promptTokens != null && (
            <span className="ml-2">
              (prompt: {message.usage.promptTokens}, completion:{" "}
              {message.usage.completionTokens ?? 0})
            </span>
          )}
        </div>
      )}
    </Message>
  );
}

function ToolMessage({
  message,
  showAvatar,
}: {
  message: MessageType;
  showAvatar: boolean;
}) {
  return (
    <Message from="assistant">
      <div className="flex items-start gap-2">
        <AvatarSlot
          show={showAvatar}
          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400"
        >
          <TerminalIcon className="size-3.5" />
        </AvatarSlot>
        <MessageContent>
          {message.content.map((part) => (
            <ContentPartRenderer key={part.id} part={part} />
          ))}
        </MessageContent>
      </div>
    </Message>
  );
}

/** Delivery state under the user message the agent should work on next:
 *  Sending… → Picked up, or "Not picked up yet" with Retry once the agent has
 *  not started it (or its retry) in time. */
function DeliveryStatus({ message }: { message: MessageType }) {
  const { deliveryMessageId, deliveryState, deliverySince, active, onRetry } =
    useChatActions();
  const isTarget = message.id === deliveryMessageId;
  const waiting = isTarget && deliveryState === "sending";
  const late = useElapsed(deliverySince, NOT_PICKED_UP_AFTER_MS, waiting);
  if (!isTarget || !deliveryState) return null;

  if (late) {
    return (
      <div className="mr-9 flex items-center justify-end gap-2 text-xs text-muted-foreground">
        <span>Not picked up yet</span>
        {active && onRetry && (
          <RetryButton onClick={() => onRetry(message.id)} />
        )}
      </div>
    );
  }

  return (
    <div className="mr-9 text-right text-xs text-muted-foreground">
      {deliveryState === "picked-up" ? "Picked up" : "Sending…"}
    </div>
  );
}

/** Retry and the host's action (e.g. a budget request) for a failed turn. */
function FailureActions({ message }: { message: MessageType }) {
  const { retryableFailureId, onRetry, renderFailureAction } = useChatActions();
  const failure = message.failure;
  if (!failure) return null;
  const hostAction =
    failure.code === "BUDGET_EXHAUSTED" && renderFailureAction
      ? renderFailureAction(failure)
      : null;
  const canRetry = message.id === retryableFailureId && !!onRetry;
  if (!hostAction && !canRetry) return null;

  return (
    <div className="ml-9 flex flex-wrap items-center gap-2">
      {canRetry && (
        <RetryButton onClick={() => onRetry(failure.userMessageId)} />
      )}
      {hostAction}
    </div>
  );
}
