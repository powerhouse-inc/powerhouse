import React, { useEffect, useMemo, useRef, useState } from "react";
import { DriveInfoItem } from "./DriveInfoItem.js";
import { ShareMenuItem } from "./ShareMenuItem.js";
import { InfoIcon } from "../icons/InfoIcon.js";
import { ExternalLinkIcon } from "../icons/ExternalLinkIcon.js";
import { ShareIcon } from "../icons/ShareIcon.js";
import { VetraIcon } from "../icons/VetraIcon.js";

interface DriveHeaderProps {
  driveId: string;
  driveName: string;
  driveUrl: string;
}

export const DriveHeader: React.FC<DriveHeaderProps> = ({
  driveId,
  driveName,
  driveUrl,
}) => {
  const [isInfoMenuOpen, setIsInfoMenuOpen] = useState(false);
  const [isShareMenuOpen, setIsShareMenuOpen] = useState(false);
  const infoMenuRef = useRef<HTMLDivElement>(null);
  const shareMenuRef = useRef<HTMLDivElement>(null);

  const toggleInfoMenu = () => {
    setIsInfoMenuOpen((prev) => !prev);
    setIsShareMenuOpen(false);
  };

  const toggleShareMenu = () => {
    setIsShareMenuOpen((prev) => !prev);
    setIsInfoMenuOpen(false);
  };

  useEffect(() => {
    if (!isInfoMenuOpen && !isShareMenuOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        infoMenuRef.current &&
        !infoMenuRef.current.contains(event.target as Node)
      ) {
        setIsInfoMenuOpen(false);
      }
      if (
        shareMenuRef.current &&
        !shareMenuRef.current.contains(event.target as Node)
      ) {
        setIsShareMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsInfoMenuOpen(false);
        setIsShareMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isInfoMenuOpen, isShareMenuOpen]);

  const shareUrl = useMemo(() => {
    if (!driveUrl) return "";
    try {
      new URL(driveUrl);
      return `${window.location.origin}/?driveUrl=${encodeURIComponent(driveUrl)}`;
    } catch {
      return "";
    }
  }, [driveUrl]);

  return (
    <div className="bg-gray-50 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <VetraIcon width={20} height={20} />
          <h1 className="text-lg font-semibold text-gray-900">
            Vetra Studio Drive
          </h1>
          <div className="relative" ref={infoMenuRef}>
            <button
              aria-label="Drive information"
              aria-expanded={isInfoMenuOpen}
              className="rounded-full p-1 transition-colors hover:bg-gray-100"
              onClick={toggleInfoMenu}
            >
              <InfoIcon className="text-gray-500" />
            </button>
            {isInfoMenuOpen && (
              <div
                role="menu"
                className="absolute left-0 top-full z-10 mt-2 flex flex-col items-start gap-2 rounded-lg bg-white p-3 shadow-lg"
              >
                <DriveInfoItem label="Name" value={driveName} />
                <DriveInfoItem label="Drive ID" value={driveId} />
              </div>
            )}
          </div>
          {driveUrl && (
            <div className="relative" ref={shareMenuRef}>
              <button
                aria-label="Share drive"
                aria-expanded={isShareMenuOpen}
                className="rounded-full p-1 transition-colors hover:bg-gray-100"
                onClick={toggleShareMenu}
              >
                <ShareIcon width={16} height={16} stroke="#343839" />
              </button>
              {isShareMenuOpen && (
                <div
                  role="menu"
                  className="absolute left-0 top-full z-10 mt-2 flex w-max flex-col gap-4 rounded-lg bg-white p-4 shadow-lg"
                >
                  <ShareMenuItem label="Copy the Drive URL" url={driveUrl} />
                  <ShareMenuItem
                    label="Share this Drive directly in Connect"
                    url={shareUrl}
                  />
                </div>
              )}
            </div>
          )}
        </div>
        <a
          href="https://academy.vetra.io/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm text-gray-900 underline transition-colors hover:text-gray-700"
        >
          <ExternalLinkIcon fill="#111827" />
          Vetra Academy
        </a>
      </div>
    </div>
  );
};
