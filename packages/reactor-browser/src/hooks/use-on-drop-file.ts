import type { FileNode } from "document-drive";
import { useCallback } from "react";
import { addFileWithProgress } from "../actions/document.js";
import type {
  ConflictResolution,
  FileUploadProgressCallback,
} from "../types/upload.js";
import { useSelectedDrive } from "./drives.js";
import { useSelectedFolder } from "./nodes.js";

type UseOnDropFile = (
  documentTypes?: string[],
) => (
  file: File,
  onProgress?: FileUploadProgressCallback,
  resolveConflict?: ConflictResolution,
) => Promise<FileNode | undefined>;

export const useOnDropFile: UseOnDropFile = (documentTypes = []) => {
  const [selectedDrive] = useSelectedDrive();
  const selectedDriveId = selectedDrive?.header.id;
  const selectedFolder = useSelectedFolder();

  const onDropFile = useCallback(
    async (
      file: File,
      onProgress?: FileUploadProgressCallback,
      resolveConflict?: ConflictResolution,
    ) => {
      if (!selectedDriveId) {
        console.warn("No selected drive - upload skipped");
        return;
      }

      const fileName = file.name.replace(/\..+/gim, "");
      const targetNodeId = selectedFolder?.id;

      // Return the FileNode directly from addFileWithProgress
      return await addFileWithProgress(
        file,
        selectedDriveId,
        fileName,
        targetNodeId,
        onProgress,
        documentTypes,
        resolveConflict,
      );
    },
    [selectedDriveId, selectedFolder],
  );

  return onDropFile;
};
