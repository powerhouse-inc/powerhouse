import { twMerge } from "tailwind-merge";

export interface StatusPillProps {
  status: "draft" | "confirmed";
  label: string;
}

export const StatusPill: React.FC<StatusPillProps> = ({ status, label }) => {
  return (
    <div
      className={twMerge(
        "rounded-full px-3 py-1 text-xs font-medium",
        status === "confirmed"
          ? "bg-green-50 text-green-900 dark:bg-green-900 dark:text-green-50"
          : "bg-yellow-50 text-yellow-900 dark:bg-yellow-900 dark:text-yellow-50",
      )}
    >
      {label}
    </div>
  );
};
