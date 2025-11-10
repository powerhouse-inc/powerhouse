import { Icon } from "@powerhousedao/design-system";
import { setSelectedNode } from "@powerhousedao/reactor-browser";
import type { Node } from "document-drive";
import {
    type ComponentPropsWithoutRef,
    type ReactNode,
    useEffect,
    useState,
} from "react";
import { twMerge } from "tailwind-merge";
import { useDrop } from "../../hooks/use-drop.js";
import { ConnectReplaceDuplicateModal } from "../modal/replace-duplicate-modal.js";
import { UploadFileListContainer } from "./upload-file-list-container.js";
import { useUploadTracker } from "./use-upload-tracker.js";
import { type OnAddFileWithProgress } from "./utils.js";

export type DropZoneProps = ComponentPropsWithoutRef<"div"> & {
  readonly title?: string;
  readonly subtitle?: string;
  readonly node?: Node;
  readonly enable?: boolean;
  readonly children?: ReactNode;
  readonly onAddFile?: OnAddFileWithProgress;
  readonly useLocalStorage?: boolean;
  readonly driveId?: string;
  readonly acceptedFileExtensions?: string[];
};

export function DropZone(props: DropZoneProps) {
  const {
    title = "Drag your documents",
    subtitle = "to drop them in the currently selected folder.",
    node,
    enable = true,
    children,
    onAddFile,
    useLocalStorage = false,
    driveId,
    acceptedFileExtensions = [".zip", ".phd", ".phdm"],
    className,
    ...delegatedProps
  } = props;

  // Modal state for conflict resolution
  const [modalOpen, setModalOpen] = useState(false);
  const [conflictUploadId, setConflictUploadId] = useState<string | null>(null);

  // Upload tracking with the new hook
  const {
    uploadsArray,
    uploadsCount,
    createUploadHandler,
    clearAllUploads,
    clearConflictedUploads,
    removeUpload,
    resolveConflict,
  } = useUploadTracker(useLocalStorage, driveId);

  // Clear conflicted uploads on mount
  useEffect(() => {
    clearConflictedUploads();
  }, []);

  // Create the upload handler from the hook
  const handleAddFile = createUploadHandler(onAddFile) ?? (async () => {});

  // Handle conflict resolution modal
  const handleConflictResolution = (uploadId: string) => {
    setConflictUploadId(uploadId);
    setModalOpen(true);
  };

  const handleReplace = () => {
    if (conflictUploadId && onAddFile) {
      resolveConflict(conflictUploadId, "replace", onAddFile);
    }
    setModalOpen(false);
    setConflictUploadId(null);
  };

  const handleDuplicate = () => {
    if (conflictUploadId && onAddFile) {
      resolveConflict(conflictUploadId, "duplicate", onAddFile);
    }
    setModalOpen(false);
    setConflictUploadId(null);
  };

  const handleModalClose = () => {
    setModalOpen(false);
    setConflictUploadId(null);
  };

  const { isDropTarget, dropProps } = useDrop({
    target: node,
    onAddFileOverride: handleAddFile,
    trackNestedDrag: true,
    acceptedFileExtensions,
  });

  return (
    <div
      className={twMerge("relative", className)}
      {...(enable ? dropProps : {})}
      {...delegatedProps}
    >
      {children}

      {enable && isDropTarget && (
        <div className="fixed inset-0 z-[1000] flex min-h-screen w-screen items-center justify-center bg-black/50">
          <div className="rounded-[24px] bg-white p-6 shadow-[1px_4px_15px_rgba(74,88,115,0.25)]">
            <div className="relative flex h-[130px] w-[400px] flex-col items-center justify-start overflow-visible rounded-lg border border-dashed border-black px-4 py-6">
              <div className="text-center text-base leading-5 text-zinc-500">
                {title}
              </div>
              <div className="text-center text-base leading-5 text-zinc-500">
                {subtitle}
              </div>

              <span className="pointer-events-none absolute -bottom-16 left-1/2 z-10 -translate-x-1/2">
                <Icon name="DocumentIcons" size={144} aria-hidden="true" />
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Upload File List - positioned at bottom right */}
      <UploadFileListContainer
        uploadsArray={uploadsArray}
        uploadsCount={uploadsCount}
        removeUpload={removeUpload}
        clearAllUploads={clearAllUploads}
        setSelectedNode={setSelectedNode}
        onConflictResolution={handleConflictResolution}
      />

      {/* Conflict Resolution Modal */}
      <ConnectReplaceDuplicateModal
        open={modalOpen}
        onOpenChange={handleModalClose}
        fileName={
          conflictUploadId
            ? uploadsArray.find((u) => u?.id === conflictUploadId)?.fileName
            : undefined
        }
        onReplace={handleReplace}
        onDuplicate={handleDuplicate}
      />
    </div>
  );
}
