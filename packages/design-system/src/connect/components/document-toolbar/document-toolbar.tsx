import { Icon } from "#design-system";
import {
  setSelectedNode,
  setSelectedTimelineItem,
  showRevisionHistory,
  useDownloadDocument,
  useGetSwitchboardLink,
  useNodeActions,
  useNodeParentFolderById,
  useSelectedDocumentSafe,
} from "@powerhousedao/reactor-browser";
import type { Node } from "@powerhousedao/shared/document-drive";
import type { PHDocument } from "@powerhousedao/shared/document-model";
import {
  Suspense,
  lazy,
  useEffect,
  useState,
  type ComponentPropsWithoutRef,
} from "react";
import { twMerge } from "tailwind-merge";
import { NodeInput } from "../node-input/node-input.js";
import { useDocumentUndoRedo } from "./utils/use-document-undo-redo.js";

const DocumentTimeline = lazy(() =>
  import("../document-timeline/document-timeline.js").then((m) => ({
    default: m.DocumentTimeline,
  })),
);

// TODO: Remove this when timeline analytics is available
// import { useDocumentTimeline } from "@powerhousedao/reactor-browser";
function useDocumentTimeline(documentId?: string) {
  return [];
}

export type DocumentToolbarControl =
  | "undo"
  | "redo"
  | "export"
  | "history"
  | "timeline";

type DocumentToolbarBaseProps = ComponentPropsWithoutRef<"div"> & {
  /**
   * Additional CSS class names to apply to the toolbar container.
   */
  className?: string;
  /**
   * Array of controls to show in the toolbar.
   * @default ["undo", "redo", "export", "switchboard", "history", "timeline"]
   */
  enabledControls?: DocumentToolbarControl[];
  /**
   * Disables the revision history button when set to true.
   * @default false
   */
  disableRevisionHistory?: boolean;
  /**
   * Callback function triggered when the switchboard link button is clicked.
   * If not provided, will use the default behavior of opening the document in switchboard.
   * The button will only be shown for documents in remote drives.
   */
  onSwitchboardLinkClick?: () => void;
  /**
   * Custom export handler for the document.
   * If not provided, will use the default export functionality.
   */
  onDownloadDocument?: (document: PHDocument) => void;
  /**
   * Controls whether the timeline is visible when the component first renders.
   * @default false
   */
  initialTimelineVisible?: boolean;
  /**
   * Controls whether the timeline toggle button is shown in the toolbar.
   * @default true
   */
  defaultTimelineVisible?: boolean;
};

export type DocumentToolbarProps = DocumentToolbarBaseProps &
  (
    | {
        /**
         * The document object to display in the toolbar.
         * When provided, the onClose callback becomes required.
         */
        document: PHDocument;
        /**
         * Callback function triggered when the close button is clicked.
         * Required when a document is provided.
         */
        onClose: () => void;
      }
    | {
        /**
         * The document object to display in the toolbar.
         * When undefined, will fall back to the currently selected document.
         */
        document?: undefined;
        /**
         * Callback function triggered when the close button is clicked.
         * Optional when no document is provided - defaults to navigating back to the parent folder.
         */
        onClose?: () => void;
      }
  );

export const DocumentToolbar: React.FC<DocumentToolbarProps> = (props) => {
  const {
    onClose,
    children,
    onDownloadDocument,
    className,
    document: _document,
    onSwitchboardLinkClick,
    enabledControls = ["undo", "redo", "export", "history"],
    defaultTimelineVisible = true,
    disableRevisionHistory = false,
    initialTimelineVisible = false,
    ...containerProps
  } = props;

  const [selectedDocument] = useSelectedDocumentSafe();
  const document = _document ?? selectedDocument;
  const { onRenameNode, onRenameDriveNodes } = useNodeActions();

  const documentName = document?.header.name || undefined;
  const [isEditingName, setIsEditingName] = useState(false);
  const parentFolder = useNodeParentFolderById(document?.header.id);
  const handleClose = onClose ?? (() => setSelectedNode(parentFolder));
  const documentUndoRedo = useDocumentUndoRedo(document?.header.id);
  const isUndoDisabled = !documentUndoRedo.canUndo;
  const isRedoDisabled = !documentUndoRedo.canRedo;
  const defaultDownloadDocument = useDownloadDocument(document?.header.id);

  const timelineItemsData = useDocumentTimeline(document?.header.id);

  const [showTimeline, setShowTimeline] = useState(initialTimelineVisible);

  const getSwitchboardLink = useGetSwitchboardLink(document);

  function handleDownloadDocument() {
    if (!document) return;
    const downloadDocument = onDownloadDocument ?? defaultDownloadDocument;
    downloadDocument(document);
  }

  const handleDefaultSwitchboardClick = async () => {
    if (getSwitchboardLink) {
      try {
        const url = await getSwitchboardLink();
        window.open(url, "_blank");
      } catch (error) {
        console.error("Error opening switchboard link:", error);
      }
    }
  };

  const resolvedSwitchboardHandler =
    onSwitchboardLinkClick ??
    (getSwitchboardLink ? handleDefaultSwitchboardClick : undefined);

  const isDownloadDisabled = !document;
  const isSwitchboardLinkDisabled = !resolvedSwitchboardHandler;
  const isTimelineDisabled = timelineItemsData.length === 0;

  useEffect(() => {
    if (typeof initialTimelineVisible === "boolean") {
      setShowTimeline(initialTimelineVisible);
    }
  }, [initialTimelineVisible]);

  const handleTimelineToggle = () => {
    if (isTimelineDisabled) return;
    setShowTimeline(!showTimeline);
  };

  return (
    <div className="flex w-full flex-col" {...containerProps}>
      <div
        className={twMerge(
          "flex h-12 w-full items-center justify-between rounded-xl border border-gray-200 bg-slate-50 px-4",
          className,
        )}
      >
        <div className="flex items-center gap-x-2">
          {enabledControls.includes("undo") && (
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
          )}
          {enabledControls.includes("redo") && (
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
          )}
          {enabledControls.includes("export") && (
            <button
              className={twMerge(
                "flex h-8 items-center rounded-lg border border-gray-200 bg-white px-3 text-sm",
                isDownloadDisabled
                  ? "cursor-not-allowed"
                  : "cursor-pointer active:opacity-70",
              )}
              onClick={handleDownloadDocument}
              disabled={isDownloadDisabled}
            >
              <span
                className={
                  isDownloadDisabled ? "text-gray-500" : "text-gray-900"
                }
              >
                Download
              </span>
            </button>
          )}
        </div>

        <div className="flex items-center">
          {isEditingName && document ? (
            <NodeInput
              defaultValue={documentName}
              className="text-center text-sm font-medium text-gray-500"
              aria-label="Document name"
              onCancel={() => setIsEditingName(false)}
              onSubmit={(newName) => {
                const node = { id: document.header.id } as Node;

                Promise.all([
                  onRenameNode(newName, node),
                  onRenameDriveNodes(newName, document.header.id),
                ])
                  .then(() => setIsEditingName(false))
                  .catch((error: unknown) => {
                    console.error("Failed to rename document:", error);
                    setIsEditingName(false);
                  });
              }}
            />
          ) : (
            <h1
              className={twMerge(
                "text-sm font-medium text-gray-500",
                document && "cursor-pointer hover:text-gray-700",
              )}
              onDoubleClick={
                document ? () => setIsEditingName(true) : undefined
              }
              title={document ? "Double-click to edit" : undefined}
            >
              {documentName}
            </h1>
          )}
        </div>

        <div className="flex items-center gap-x-2">
          {!isSwitchboardLinkDisabled && (
            <button
              className={twMerge(
                "grid size-8 place-items-center rounded-lg border border-gray-200 bg-white",
                "cursor-pointer active:opacity-70",
              )}
              onClick={resolvedSwitchboardHandler}
              disabled={isSwitchboardLinkDisabled}
            >
              <Icon name="Drive" size={16} className="text-gray-900" />
            </button>
          )}
          {enabledControls.includes("history") && (
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
          )}
          {enabledControls.includes("timeline") && defaultTimelineVisible && (
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
            id="close-document-button"
            aria-label="Close document"
            className="grid size-8 cursor-pointer place-items-center rounded-lg border border-gray-200 bg-white active:opacity-70"
            onClick={handleClose}
          >
            <Icon name="XmarkLight" size={16} className="text-gray-900" />
          </button>
        </div>
      </div>

      {showTimeline && (
        <div className="mt-2 w-full">
          <Suspense fallback={null}>
            <DocumentTimeline
              timeline={timelineItemsData}
              onItemClick={setSelectedTimelineItem}
            />
          </Suspense>
        </div>
      )}
      {children}
    </div>
  );
};
