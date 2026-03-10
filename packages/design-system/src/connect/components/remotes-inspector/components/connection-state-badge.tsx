import { twMerge } from "tailwind-merge";

export type ConnectionStateBadgeProps = {
  readonly state: string;
  readonly failureCount: number;
};

const stateStyles: Record<string, string> = {
  connected: "bg-green-100 text-green-800",
  connecting: "bg-blue-100 text-blue-800",
  reconnecting: "bg-yellow-100 text-yellow-800",
  error: "bg-red-100 text-red-800",
  disconnected: "bg-gray-100 text-gray-600",
};

export function ConnectionStateBadge({
  state,
  failureCount,
}: ConnectionStateBadgeProps) {
  const style = stateStyles[state] ?? "bg-gray-100 text-gray-600";

  return (
    <span
      className={twMerge(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        style,
      )}
    >
      {state}
      {failureCount > 0 && (
        <span className="text-[10px] opacity-75">({failureCount})</span>
      )}
    </span>
  );
}
