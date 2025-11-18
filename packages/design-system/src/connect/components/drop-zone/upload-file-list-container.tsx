import type { Node } from "document-drive";
import { type ComponentPropsWithoutRef } from "react";
import { twMerge } from "tailwind-merge";
import { UploadFileList } from "../upload-file-list/upload-file-list.js";
import { mapUploadsToFileItems, type UploadTracker } from "./utils.js";

export type UploadFileListContainerProps = ComponentPropsWithoutRef<"div"> & {
  readonly uploadsArray: (UploadTracker | undefined)[];
  readonly uploadsCount: number;
  readonly removeUpload: (uploadId: string) => void;
  readonly clearAllUploads: () => void;
  readonly setSelectedNode?: (
    nodeOrNodeSlug: Node | string | undefined,
  ) => void;
  readonly onClose?: () => void;
  readonly onConflictResolution?: (uploadId: string) => void;
};

export function UploadFileListContainer(props: UploadFileListContainerProps) {
  const {
    uploadsArray,
    uploadsCount,
    removeUpload,
    clearAllUploads,
    setSelectedNode,
    onClose,
    onConflictResolution,
    className,
    ...delegatedProps
  } = props;

  // Don't render if there are no uploads
  if (uploadsCount === 0) return null;

  const items = mapUploadsToFileItems(
    uploadsArray,
    removeUpload,
    setSelectedNode,
    onConflictResolution,
  );

  const handleClose = onClose ?? clearAllUploads;

  return (
    <div
      className={twMerge("fixed bottom-4 right-4 z-[1001]", className)}
      {...delegatedProps}
    >
      <UploadFileList items={items} onClose={handleClose} />
    </div>
  );
}
