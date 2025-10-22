import { Icon } from "@powerhousedao/design-system";
import {
  exportDocument,
  setSelectedNode,
  setSelectedTimelineItem,
  showRevisionHistory,
  useDocumentById,
  useDocumentTimeline,
  useNodeParentFolderById,
  useSelectedDocument,
} from "@powerhousedao/reactor-browser";
import { useEffect, useState } from "react";
import { twMerge } from "tailwind-merge";
import { DocumentTimeline } from "../document-timeline/document-timeline.js";
import { useDocumentUndoRedo } from "./utils/use-document-undo-redo.js";

export type DocumentToolbarV2Props = {
  documentId?: string;
  className?: string;
  disableRevisionHistory?: boolean;
  onSwitchboardLinkClick?: () => void;
  initialTimelineVisible?: boolean;
  timelineButtonVisible?: boolean;
  onClose?: () => void;
};

export const DocumentToolbarV2: React.FC<DocumentToolbarV2Props> = (props) => {
  const {
    documentId,
    className,
    disableRevisionHistory = false,
    onSwitchboardLinkClick,
    initialTimelineVisible = false,
    timelineButtonVisible = false,
    onClose,
  } = props;

  const [selectedDoc] = useSelectedDocument();
  const [docById] = useDocumentById(documentId);
  const document = documentId ? docById : selectedDoc;

  const documentName = document?.header.name || undefined;
  const parentFolder = useNodeParentFolderById(document?.header.id);
  const handleClose = onClose ?? (() => setSelectedNode(parentFolder));
  const handleExport = exportDocument;

  const documentUndoRedo = useDocumentUndoRedo(document?.header.id);
  const isUndoDisabled = !documentUndoRedo.canUndo;
  const isRedoDisabled = !documentUndoRedo.canRedo;

  const timelineItemsData = useDocumentTimeline(document?.header.id);

  const [showTimeline, setShowTimeline] = useState(initialTimelineVisible);

  const isExportDisabled = !document;
  const isSwitchboardLinkDisabled = !onSwitchboardLinkClick;
  const isTimelineDisabled = timelineItemsData.length === 0;

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
            onClick={documentUndoRedo.undo}
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
            onClick={documentUndoRedo.redo}
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
            onClick={() => void handleExport(document)}
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
          <h1 className="text-sm font-medium text-gray-500">{documentName}</h1>
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
              disableRevisionHistory
                ? "cursor-not-allowed"
                : "cursor-pointer active:opacity-70",
            )}
            onClick={showRevisionHistory}
            disabled={disableRevisionHistory}
          >
            <Icon
              name="History"
              size={16}
              className={
                disableRevisionHistory ? "text-gray-500" : "text-gray-900"
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
            onClick={handleClose}
          >
            <Icon name="XmarkLight" size={16} className="text-gray-900" />
          </button>
        </div>
      </div>

      {showTimeline && (
        <div className="mt-2 w-full">
          <DocumentTimeline
            timeline={timelineItemsData}
            onItemClick={setSelectedTimelineItem}
          />
        </div>
      )}
    </div>
  );
};
