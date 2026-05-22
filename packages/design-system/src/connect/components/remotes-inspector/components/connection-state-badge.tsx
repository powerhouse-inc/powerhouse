import { twMerge } from "tailwind-merge";

export type ConnectionStateBadgeProps = {
  readonly state: string;
  readonly failureCount: number;
};

const stateStyles: Record<string, string> = {
  connected:
    "bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100",
  connecting: "bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100",
  reconnecting:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100",
  error: "bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100",
  disconnected:
    "bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300",
};

export function ConnectionStateBadge({
  state,
  failureCount,
}: ConnectionStateBadgeProps) {
  const style =
    stateStyles[state] ??
    "bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300";

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
