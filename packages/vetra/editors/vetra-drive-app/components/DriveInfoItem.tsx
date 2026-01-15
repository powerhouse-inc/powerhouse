import React from "react";
import { usePHToast } from "@powerhousedao/reactor-browser";
import { LinkIcon } from "../icons/LinkIcon.js";

interface DriveInfoItemProps {
  label: string;
  value: string;
}

export const DriveInfoItem: React.FC<DriveInfoItemProps> = ({
  label,
  value,
}) => {
  const toast = usePHToast();

  const handleCopy = () => {
    if (!navigator.clipboard) {
      toast?.("Clipboard not available", { type: "error" });
      return;
    }
    navigator.clipboard
      .writeText(value)
      .then(() => {
        toast?.("Copied to clipboard", { type: "connect-success" });
      })
      .catch(() => {
        toast?.("Failed to copy to clipboard", { type: "error" });
      });
  };

  return (
    <button
      aria-label={`Copy ${label}`}
      className="flex h-8 items-center gap-1 whitespace-nowrap rounded-lg bg-slate-50 pl-1 pr-2 text-xs text-stone-300"
      onClick={handleCopy}
    >
      <LinkIcon width={14} height={14} />
      {label}
      <span className="text-gray-900">{value}</span>
    </button>
  );
};
