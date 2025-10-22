import {
  useIsDragAndDropEnabled,
  useOnDropFile,
  useSelectedDriveId,
} from "@powerhousedao/reactor-browser";
import type { ComponentPropsWithoutRef } from "react";
import { DropZone } from "./drop-zone.js";
import type { OnAddFileWithProgress } from "./utils.js";

export function DropZoneWrapper({
  children,
  ...props
}: { children: React.ReactNode } & ComponentPropsWithoutRef<"div">) {
  const isDragAndDropEnabled = useIsDragAndDropEnabled();
  const selectedDriveId = useSelectedDriveId();

  const onDropFile = useOnDropFile();

  const onAddFile: OnAddFileWithProgress = async (
    file,
    parent,
    onProgress,
    resolveConflict,
  ) => {
    return await onDropFile(file, onProgress, resolveConflict);
  };

  if (!isDragAndDropEnabled || !selectedDriveId) {
    return <>{children}</>;
  }

  return (
    <DropZone
      onAddFile={onAddFile}
      driveId={selectedDriveId}
      useLocalStorage={true}
      {...props}
    >
      {children}
    </DropZone>
  );
}
