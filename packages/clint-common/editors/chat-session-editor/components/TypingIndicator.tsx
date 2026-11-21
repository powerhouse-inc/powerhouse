import { Message, MessageContent } from "./ai-elements/message.js";
import { BotIcon } from "lucide-react";

interface TypingIndicatorProps {
  /** Show the assistant avatar — only when this starts the turn. */
  showAvatar?: boolean;
}

/** Three bouncing dots shown while the agent is working before its reply text
 *  appears, mirroring the assistant message layout so it aligns with the turn. */
export function TypingIndicator({ showAvatar = true }: TypingIndicatorProps) {
  return (
    <Message from="assistant">
      <div className="flex items-start gap-2">
        {showAvatar ? (
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
            <BotIcon className="size-3.5" />
          </div>
        ) : (
          <div className="size-7 shrink-0" aria-hidden />
        )}
        <MessageContent>
          <div
            className="flex items-center gap-1 py-2 text-muted-foreground"
            role="status"
            aria-label="Agent is typing"
          >
            {[0, 150, 300].map((delay) => (
              <span
                key={delay}
                className="size-1.5 animate-bounce rounded-full bg-current"
                style={{ animationDelay: `${delay}ms` }}
              />
            ))}
          </div>
        </MessageContent>
      </div>
    </Message>
  );
}
