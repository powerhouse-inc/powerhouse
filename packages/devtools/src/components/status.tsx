import type { ComponentProps } from "react";
import { cn } from "../lib/cn.js";

export type Tone = "ok" | "warn" | "error" | "info" | "idle";

const TONE_BG: Record<Tone, string> = {
  ok: "bg-success",
  warn: "bg-warning",
  error: "bg-destructive",
  info: "bg-info",
  idle: "bg-muted-foreground/50",
};

/** Status pills: a pale tint with text of the same hue, never a saturated
 * fill with white text. */
const TONE_TINT: Record<Tone, string> = {
  ok: "bg-success/12 text-success",
  warn: "bg-warning/12 text-warning",
  error: "bg-destructive/12 text-destructive",
  info: "bg-info/12 text-info",
  idle: "bg-foreground/[0.06] text-muted-foreground",
};

/** Text in a tone: only problems take a colour of their own. */
export const TONE_TEXT: Record<Tone, string> = {
  ok: "text-foreground",
  info: "text-foreground",
  idle: "text-muted-foreground",
  warn: "text-warning",
  error: "text-destructive",
};

export function StatusDot({
  tone,
  pulse,
  className,
}: {
  tone: Tone;
  pulse?: boolean;
  className?: string;
}) {
  if (!pulse)
    return (
      <span
        className={cn(
          "inline-flex size-2 shrink-0 rounded-full",
          TONE_BG[tone],
          className,
        )}
      />
    );
  return (
    <span className={cn("relative inline-flex size-2 shrink-0", className)}>
      <span
        className={cn(
          "absolute inline-flex size-full animate-ping rounded-full opacity-60",
          TONE_BG[tone],
        )}
      />
      <span
        className={cn(
          "relative inline-flex size-full rounded-full",
          TONE_BG[tone],
        )}
      />
    </span>
  );
}

export function Tag({
  tone = "idle",
  className,
  ...props
}: ComponentProps<"span"> & { tone?: Tone }) {
  return (
    <span
      {...props}
      className={cn(
        "inline-flex h-5 flex-none items-center gap-1 rounded px-1.5 text-[11px] whitespace-nowrap",
        TONE_TINT[tone],
        className,
      )}
    />
  );
}
