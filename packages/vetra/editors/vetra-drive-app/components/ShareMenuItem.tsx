import React, { useState } from "react";
import { usePHToast } from "@powerhousedao/reactor-browser";
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
      <span className="text-xs text-gray-500">{label}</span>
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
            className="w-[300px] truncate rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-800 underline outline-none"
          />
          {showTooltip && (
            <div className="absolute left-0 top-full z-20 mt-1 max-w-md break-all rounded-lg bg-gray-800 px-3 py-2 text-xs text-white shadow-lg">
              {url}
            </div>
          )}
        </div>
        <button
          aria-label="Copy URL"
          className="rounded p-1 transition-colors hover:bg-gray-100"
          onClick={handleCopy}
        >
          <CopyIcon width={16} height={16} fill="#9CA3AF" />
        </button>
      </div>
    </div>
  );
};
