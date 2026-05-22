import { usePHToast } from "@powerhousedao/reactor-browser";
import React, { useState } from "react";
import { CopyIcon } from "../icons/CopyIcon.js";

interface ShareMenuItemProps {
  label: string;
  url: string;
}

export const ShareMenuItem: React.FC<ShareMenuItemProps> = ({ label, url }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const toast = usePHToast();

  const handleCopy = () => {
    if (!navigator.clipboard) {
      toast?.("Clipboard not available", { type: "error" });
      return;
    }
    navigator.clipboard
      .writeText(url)
      .then(() => {
        toast?.("URL copied to clipboard", { type: "connect-success" });
      })
      .catch(() => {
        toast?.("Failed to copy to clipboard", { type: "error" });
      });
  };

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-gray-500 dark:text-slate-400">{label}</span>
      <div className="flex items-center gap-2">
        <div
          className="relative"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <input
            type="text"
            readOnly
            value={url}
            className="w-[300px] truncate rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-800 underline outline-none placeholder:text-gray-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-200"
          />
          {showTooltip && (
            <div className="absolute top-full left-0 z-20 mt-1 max-w-md rounded-lg bg-gray-800 px-3 py-2 text-xs break-all text-white shadow-lg dark:bg-slate-100 dark:text-slate-900">
              {url}
            </div>
          )}
        </div>
        <button
          aria-label="Copy URL"
          className="rounded-sm p-1 transition-colors hover:bg-gray-100 dark:hover:bg-slate-800"
          onClick={handleCopy}
        >
          <CopyIcon width={16} height={16} fill="#9CA3AF" />
        </button>
      </div>
    </div>
  );
};
