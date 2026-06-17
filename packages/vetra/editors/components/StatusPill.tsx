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
          ? "bg-success/10 text-success"
          : "bg-warning/10 text-warning",
      )}
    >
      {label}
    </div>
  );
};
