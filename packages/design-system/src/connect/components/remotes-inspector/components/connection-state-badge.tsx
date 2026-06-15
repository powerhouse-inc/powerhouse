import { twMerge } from "tailwind-merge";

export type ConnectionStateBadgeProps = {
  readonly state: string;
  readonly failureCount: number;
};

const stateStyles: Record<string, string> = {
  connected: "bg-success/10 text-success",
  connecting: "bg-info/10 text-info",
  reconnecting: "bg-warning/10 text-warning",
  error: "bg-destructive/10 text-destructive",
  disconnected: "bg-muted text-foreground",
};

export function ConnectionStateBadge({
  state,
  failureCount,
}: ConnectionStateBadgeProps) {
  const style = stateStyles[state] ?? "bg-muted text-foreground";

  return (
    <span
      className={twMerge(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        style,
      )}
    >
      {state}
      {failureCount > 0 && (
        <span className="text-xs opacity-75">({failureCount})</span>
      )}
    </span>
  );
}
