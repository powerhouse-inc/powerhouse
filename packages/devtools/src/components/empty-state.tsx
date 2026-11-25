import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../lib/cn.js";
import type { DataAttributes } from "../lib/data-attributes.js";
import type { Tone } from "./status.js";

type EmptyTone = Extract<Tone, "idle" | "warn" | "error">;

const ICON_TONE: Record<EmptyTone, string> = {
  idle: "border-border bg-card text-muted-foreground",
  warn: "border-warning/25 bg-warning/10 text-warning",
  error: "border-destructive/25 bg-destructive/10 text-destructive",
};

/** What a page or a pane shows in place of content it does not have: what is
 * missing, why, and what to do about it. */
export function EmptyState({
  icon: Icon,
  tone = "idle",
  title,
  children,
  reason,
  action,
  compact = false,
  role,
  className,
  ...data
}: {
  icon: LucideIcon;
  tone?: EmptyTone;
  title: ReactNode;
  /** One or two sentences below the title. */
  children?: ReactNode;
  /** The error as it arrived, set apart from the page's own words. */
  reason?: ReactNode;
  /** A command to copy, a button. */
  action?: ReactNode;
  /** For a pane beside other content, not a whole page. */
  compact?: boolean;
  role?: "alert" | "status";
  className?: string;
} & DataAttributes) {
  return (
    <div
      {...data}
      role={role}
      className={cn(
        "mx-auto flex w-full max-w-xl flex-col items-center px-3 text-center",
        compact ? "py-6" : "py-8 @md/main:py-14",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex size-9 items-center justify-center rounded-lg border",
          ICON_TONE[tone],
        )}
      >
        <Icon className="size-4" />
      </span>
      <h3 className="mt-3 text-[13px] font-medium text-balance">{title}</h3>
      {children && (
        <div className="mt-1 max-w-md text-[13px] text-pretty text-muted-foreground">
          {children}
        </div>
      )}
      {reason && (
        <p
          data-slot="reason"
          className="mt-3 max-w-full rounded-md bg-foreground/[0.04] px-2.5 py-1.5 text-left font-mono text-[11.5px] [overflow-wrap:anywhere] whitespace-pre-line text-muted-foreground"
        >
          {reason}
        </p>
      )}
      {action && <div className="mt-4 w-full text-left">{action}</div>}
    </div>
  );
}
