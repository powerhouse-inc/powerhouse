export interface StatusPillProps {
  status: "draft" | "confirmed";
  label: string;
}

export const StatusPill: React.FC<StatusPillProps> = ({ status, label }) => {
  return (
    <div
      className={`rounded-full px-3 py-1 text-xs font-medium ${
        status === "confirmed"
          ? "bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-400"
          : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
      }`}
    >
      {label}
    </div>
  );
};
