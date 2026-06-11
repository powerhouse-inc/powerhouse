import { twMerge } from "tailwind-merge";

export type ConnectionStateBadgeProps = {
  readonly state: string;
  readonly failureCount: number;
};

const stateStyles: Record<string, string> = {
  connected:
    "bg-green-50 text-green-900 dark:bg-green-900 dark:text-green-50",
  connecting: "bg-blue-50 text-blue-900 dark:bg-blue-900 dark:text-blue-50",
  reconnecting:
    "bg-yellow-50 text-yellow-900 dark:bg-yellow-900 dark:text-yellow-50",
  error: "bg-red-50 text-red-900 dark:bg-red-900 dark:text-red-50",
  disconnected:
    "bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-slate-200",
};

export function ConnectionStateBadge({
  state,
  failureCount,
}: ConnectionStateBadgeProps) {
  const style =
    stateStyles[state] ??
    "bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-slate-200";

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
