import type { SessionStatus, UsageSummary } from "document-models/chat-session";
import {
  ActivityIcon,
  CheckCircleIcon,
  XCircleIcon,
  AlertTriangleIcon,
  ClockIcon,
  MessageSquareIcon,
  WrenchIcon,
  HashIcon,
} from "lucide-react";
import { cn } from "../lib/utils.js";

interface SessionStatusBarProps {
  status: SessionStatus;
  startedAt: string | null | undefined;
  endedAt: string | null | undefined;
  usage: UsageSummary | null | undefined;
  messageCount: number;
  /** Shown as a Resume button while the session is in ERROR. */
  onResume?: () => void;
  children?: React.ReactNode;
}

const statusConfig: Record<
  SessionStatus,
  { icon: typeof ActivityIcon; label: string; className: string }
> = {
  ACTIVE: {
    icon: ActivityIcon,
    label: "Active",
    className: "text-green-600 bg-green-50 dark:bg-green-950/30",
  },
  COMPLETED: {
    icon: CheckCircleIcon,
    label: "Completed",
    className: "text-blue-600 bg-blue-50 dark:bg-blue-950/30",
  },
  ABORTED: {
    icon: XCircleIcon,
    label: "Aborted",
    className: "text-orange-600 bg-orange-50 dark:bg-orange-950/30",
  },
  ERROR: {
    icon: AlertTriangleIcon,
    label: "Error",
    className: "text-red-600 bg-red-50 dark:bg-red-950/30",
  },
};

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleTimeString();
}

export function SessionStatusBar({
  status,
  startedAt,
  endedAt,
  usage,
  messageCount,
  onResume,
  children,
}: SessionStatusBarProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div className="shrink-0 flex flex-wrap items-center gap-3 border-t border-border bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium",
          config.className,
        )}
      >
        <Icon className="size-3" />
        {config.label}
      </span>

      {status === "ERROR" && onResume && (
        <button
          type="button"
          onClick={onResume}
          className="inline-flex items-center rounded-md border border-border bg-background px-2 py-0.5 font-medium text-foreground hover:bg-muted"
        >
          Resume
        </button>
      )}

      <span className="flex items-center gap-1">
        <ClockIcon className="size-3" />
        {formatTime(startedAt)}
        {endedAt && <> &mdash; {formatTime(endedAt)}</>}
      </span>

      <span className="flex items-center gap-1">
        <MessageSquareIcon className="size-3" />
        {messageCount} messages
      </span>

      {usage && (
        <>
          <span className="flex items-center gap-1">
            <HashIcon className="size-3" />
            {usage.totalTokens.toLocaleString()} tokens
          </span>
          <span className="flex items-center gap-1">
            <WrenchIcon className="size-3" />
            {usage.totalToolCalls} tool calls
          </span>
        </>
      )}

      {children && (
        <div className="ml-auto flex items-center gap-2">{children}</div>
      )}
    </div>
  );
}
