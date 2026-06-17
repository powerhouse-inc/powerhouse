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
      <span className="text-xs text-muted-foreground">{label}</span>
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
            className="w-[300px] truncate rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground underline outline-none placeholder:text-muted-foreground disabled:disabled-effect"
          />
          {showTooltip && (
            <div className="absolute top-full left-0 z-20 mt-1 max-w-md rounded-lg bg-primary px-3 py-2 text-xs break-all text-primary-foreground shadow-lg">
              {url}
            </div>
          )}
        </div>
        <button
          aria-label="Copy URL"
          className="rounded-sm p-1 transition-colors hover:hover-effect"
          onClick={handleCopy}
        >
          <CopyIcon width={16} height={16} fill="#9CA3AF" />
        </button>
      </div>
    </div>
  );
};
