import {
  setSelectedNode,
  useIsDragAndDropEnabled,
  useOnDropFile,
  useSelectedDriveId,
} from "@powerhousedao/reactor-browser";
import { DropZone } from "./drop-zone.js";
import type { OnAddFileWithProgress } from "./utils.js";

export function DropZoneWrapper({ children }: { children: React.ReactNode }) {
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
      setSelectedNode={setSelectedNode}
      driveId={selectedDriveId}
      useLocalStorage={true}
      style={{ height: "100%" }}
    >
      {children}
    </DropZone>
  );
}
