import {
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { LoaderCircle, type LucideIcon } from "lucide-react";
import { highlight, type CodeLang } from "./highlight.js";
import { cn } from "./lib/cn.js";
import { ScrollArea } from "./ui/scroll-area.js";

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

export const FOCUS_CLASS = "bg-primary/20 text-foreground hover:bg-primary/25";

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

export function Section({
  title,
  tabs,
  aside,
  children,
  className,
  ...data
}: {
  title: ReactNode;
  /** Tabs that choose what the section shows, beside its title. */
  tabs?: ReactNode;
  /** Sits at the end of the header: a count, a path. */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
} & { [k: `data-${string}`]: string | undefined }) {
  return (
    <section {...data} className={cn("min-w-0", className)}>
      <header className="flex min-h-8 flex-wrap items-center gap-x-3 border-b pb-1.5">
        <h3 className="min-w-0 text-[13px] font-medium break-words">{title}</h3>
        {tabs}
        {aside && (
          <div className="ml-auto flex min-w-0 items-center gap-2 text-[12px] text-muted-foreground">
            {aside}
          </div>
        )}
      </header>
      <div className="pt-2.5">{children}</div>
    </section>
  );
}

export function KV({
  rows,
  className,
}: {
  rows: [ReactNode, ReactNode][];
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "grid grid-cols-[minmax(90px,auto)_1fr] gap-x-4 gap-y-1.5 text-xs",
        className,
      )}
    >
      {rows.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="min-w-0 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Code({
  children,
  className,
  lang,
}: {
  children: ReactNode;
  className?: string;
  lang?: CodeLang;
}) {
  // A file of up to 256 KiB takes long to highlight: not at every render.
  const body = useMemo(
    () =>
      lang && typeof children === "string"
        ? highlight(children, lang)
        : children,
    [children, lang],
  );
  return (
    <ScrollArea
      className={cn(
        "rounded-md bg-foreground/[0.035] font-mono text-[12px] leading-relaxed whitespace-pre",
        className,
      )}
    >
      <pre className="px-3 py-2 [white-space:inherit]">{body}</pre>
    </ScrollArea>
  );
}

export function Mono({ className, ...props }: ComponentProps<"span">) {
  return (
    <span {...props} className={cn("font-mono text-[11.5px]", className)} />
  );
}

const EMPTY_ICON: Record<"idle" | "warn" | "error", string> = {
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
  tone?: "idle" | "warn" | "error";
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
} & { [k: `data-${string}`]: string | undefined }) {
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
          EMPTY_ICON[tone],
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

/** Content that is on its way. */
export function Loading({
  children,
  compact = false,
  ...data
}: {
  children: ReactNode;
  compact?: boolean;
} & { [k: `data-${string}`]: string | undefined }) {
  return (
    <p
      {...data}
      role="status"
      className={cn(
        "flex items-center justify-center gap-2 text-[13px] text-muted-foreground",
        compact ? "py-6" : "py-8 @md/main:py-14",
      )}
    >
      <LoaderCircle aria-hidden className="size-3.5 animate-spin" />
      {children}
    </p>
  );
}

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function formatAgo(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 5) return "now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function RelTime({ at, className }: { at: number; className?: string }) {
  const now = useNow();
  return (
    <time
      className={cn("tabular-nums", className)}
      dateTime={new Date(at).toISOString()}
      title={new Date(at).toLocaleString()}
    >
      {formatAgo(at, now)}
    </time>
  );
}
