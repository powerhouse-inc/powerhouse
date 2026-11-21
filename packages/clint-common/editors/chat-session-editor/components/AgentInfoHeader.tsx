import type { AgentInfo } from "document-models/chat-session";
import {
  BotIcon,
  BrainIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "lucide-react";
import { useState, type ComponentType } from "react";
import { useAttachmentUrl } from "./ContentPartRenderer.js";

/** Override for the agent avatar. Receives the derived `responding` state so an
 *  injected component can animate while the agent replies. `size` is in px. */
export type AgentAvatarProps = { responding: boolean; size: number };

interface AgentInfoHeaderProps {
  agent: AgentInfo | null | undefined;
  /** True while the agent is answering the latest user message. */
  responding?: boolean;
  /** When set, replaces the default attachment-image / bot-icon avatar. */
  avatar?: ComponentType<AgentAvatarProps>;
}

export function AgentInfoHeader({
  agent,
  responding = false,
  avatar: Avatar,
}: AgentInfoHeaderProps) {
  const [collapsed, setCollapsed] = useState(false);
  const avatarSrc = useAttachmentUrl(agent?.attachment) ?? null;

  if (!agent) return null;

  // boxClass/iconClass are passed as literals at the call sites so Tailwind
  // detects them; size is the px the override component renders at.
  const renderAvatar = (boxClass: string, iconClass: string, size: number) => {
    if (Avatar) return <Avatar responding={responding} size={size} />;
    if (avatarSrc)
      return (
        <img
          src={avatarSrc}
          alt=""
          className={`${boxClass} rounded-full object-cover`}
        />
      );
    return (
      <div
        className={`flex ${boxClass} items-center justify-center rounded-full bg-primary/10`}
      >
        <BotIcon className={iconClass} />
      </div>
    );
  };

  if (collapsed) {
    return (
      <div
        className="shrink-0 flex items-center gap-2 border-b border-border bg-muted/30 px-4 py-1.5 cursor-pointer select-none"
        onClick={() => setCollapsed(false)}
      >
        {renderAvatar("size-6", "size-3 text-primary", 24)}
        <span className="text-sm font-medium truncate">
          {agent.name || "Unnamed Agent"}
        </span>
        {agent.model && (
          <span className="text-xs text-muted-foreground truncate">
            {agent.model}
          </span>
        )}
        <ChevronDownIcon className="ml-auto size-4 text-muted-foreground shrink-0" />
      </div>
    );
  }

  return (
    <div className="shrink-0 border-b border-border bg-muted/30 px-4 py-3">
      <div className="flex items-center gap-3">
        {renderAvatar("size-8", "size-4 text-primary", 32)}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">
              {agent.name || "Unnamed Agent"}
            </span>
            {agent.model && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <BrainIcon className="size-3" />
                {agent.model}
              </span>
            )}
          </div>
          {agent.id && (
            <span className="text-xs text-muted-foreground font-mono">
              {agent.id}
            </span>
          )}
          {agent.description && (
            <p className="text-xs text-muted-foreground mt-1">
              {agent.description}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="flex items-center rounded-md p-1 text-muted-foreground hover:bg-muted transition-colors"
        >
          <ChevronUpIcon className="size-4" />
        </button>
      </div>
    </div>
  );
}
