import { Icon } from "#powerhouse";
import { useEffect, useState } from "react";
import { twMerge } from "tailwind-merge";
import {
  DocumentTimeline,
  type DocumentTimelineProps,
  type TimelineBarItem,
  type TimelineDividerItem,
} from "../document-timeline/document-timeline.js";

export type DocumentToolbarProps = {
  title?: string;
  className?: string;
  undo?: () => void;
  redo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onExport?: () => void;
  onClose: () => void;
  onShowRevisionHistory?: () => void;
  timelineItems?: Array<TimelineBarItem | TimelineDividerItem>;
  onSwitchboardLinkClick?: () => void;
  initialTimelineVisible?: boolean;
  timelineButtonVisible?: boolean;
  onTimelineItemClick?: DocumentTimelineProps["onItemClick"];
};

export const DocumentToolbar: React.FC<DocumentToolbarProps> = (props) => {
  const {
    undo,
    canUndo,
    redo,
    canRedo,
    title,
    onClose,
    onExport,
    className,
    onShowRevisionHistory,
    onSwitchboardLinkClick,
    timelineItems = [],
    onTimelineItemClick,
    initialTimelineVisible = false,
    timelineButtonVisible = false,
  } = props;

  const [showTimeline, setShowTimeline] = useState(initialTimelineVisible);

  const isUndoDisabled = !canUndo || !undo;
  const isRedoDisabled = !canRedo || !redo;
  const isExportDisabled = !onExport;
  const isSwitchboardLinkDisabled = !onSwitchboardLinkClick;
  const isRevisionHistoryDisabled = !onShowRevisionHistory;
  const isTimelineDisabled = timelineItems.length === 0;

  useEffect(() => {
    if (initialTimelineVisible) {
      setShowTimeline(true);
    }
  }, [initialTimelineVisible]);

  const handleTimelineToggle = () => {
    if (isTimelineDisabled) return;
    setShowTimeline(!showTimeline);
  };

  return (
    <div className="flex w-full flex-col">
      <div
        className={twMerge(
          "flex h-12 w-full items-center justify-between rounded-xl border border-gray-200 bg-slate-50 px-4",
          className,
        )}
      >
        <div className="flex items-center gap-x-2">
          <button
            className={twMerge(
              "grid size-8 place-items-center rounded-lg border border-gray-200 bg-white",
              isUndoDisabled
                ? "cursor-not-allowed"
                : "cursor-pointer active:opacity-70",
            )}
            onClick={undo}
            disabled={isUndoDisabled}
          >
            <Icon
              name="ArrowCouterclockwise"
              size={16}
              className={isUndoDisabled ? "text-gray-500" : "text-gray-900"}
            />
          </button>
          <button
            className={twMerge(
              "grid size-8 place-items-center rounded-lg border border-gray-200 bg-white",
              isRedoDisabled
                ? "cursor-not-allowed"
                : "cursor-pointer active:opacity-70",
            )}
            onClick={redo}
            disabled={isRedoDisabled}
          >
            <div className="-scale-x-100">
              <Icon
                name="ArrowCouterclockwise"
                size={16}
                className={isRedoDisabled ? "text-gray-500" : "text-gray-900"}
              />
            </div>
          </button>
          <button
            className={twMerge(
              "flex h-8 items-center rounded-lg border border-gray-200 bg-white px-3 text-sm",
              isExportDisabled
                ? "cursor-not-allowed"
                : "cursor-pointer active:opacity-70",
            )}
            onClick={onExport}
            disabled={isExportDisabled}
          >
            <span
              className={isExportDisabled ? "text-gray-500" : "text-gray-900"}
            >
              Export
            </span>
          </button>
        </div>

        <div className="flex items-center">
          <h1 className="text-sm font-medium text-gray-500">{title}</h1>
        </div>

        <div className="flex items-center gap-x-2">
          {!isSwitchboardLinkDisabled ? (
            <button
              className={twMerge(
                "grid size-8 place-items-center rounded-lg border border-gray-200 bg-white",
                "cursor-pointer active:opacity-70",
              )}
              onClick={onSwitchboardLinkClick}
              disabled={isSwitchboardLinkDisabled}
            >
              <Icon name="Drive" size={16} className="text-gray-900" />
            </button>
          ) : null}
          <button
            className={twMerge(
              "grid size-8 place-items-center rounded-lg border border-gray-200 bg-white",
              isRevisionHistoryDisabled
                ? "cursor-not-allowed"
                : "cursor-pointer active:opacity-70",
            )}
            onClick={onShowRevisionHistory}
            disabled={isRevisionHistoryDisabled}
          >
            <Icon
              name="History"
              size={16}
              className={
                isRevisionHistoryDisabled ? "text-gray-500" : "text-gray-900"
              }
            />
          </button>
          {timelineButtonVisible && (
            <button
              className={twMerge(
                "grid size-8 place-items-center rounded-lg border border-gray-200 bg-white",
                isTimelineDisabled
                  ? "cursor-not-allowed"
                  : "cursor-pointer active:opacity-70",
              )}
              onClick={handleTimelineToggle}
              disabled={isTimelineDisabled}
              aria-pressed={showTimeline}
            >
              <Icon
                name="Timeline"
                size={16}
                className={twMerge(
                  "text-gray-900",
                  isTimelineDisabled && "opacity-50",
                  showTimeline && "text-blue-600",
                )}
              />
            </button>
          )}
          <button
            className="grid size-8 cursor-pointer place-items-center rounded-lg border border-gray-200 bg-white active:opacity-70"
            onClick={onClose}
          >
            <Icon name="XmarkLight" size={16} className="text-gray-900" />
          </button>
        </div>
      </div>

      {showTimeline && (
        <div className="mt-2 w-full">
          <DocumentTimeline
            timeline={timelineItems}
            onItemClick={onTimelineItemClick}
          />
        </div>
      )}
    </div>
  );
};
