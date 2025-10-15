import { useCallback } from "react";
import { addFileWithProgress } from "../actions/document.js";
import type {
  ConflictResolution,
  FileUploadProgressCallback,
  UseOnDropFile,
} from "../types/upload.js";
import { useSelectedDriveSafe } from "./selected-drive.js";
import { useSelectedFolder } from "./selected-folder.js";
import { useSupportedDocumentTypes } from "./supported-document-types.js";

export const useOnDropFile: UseOnDropFile = () => {
  const [selectedDrive] = useSelectedDriveSafe();
  const supportedDocumentTypes = useSupportedDocumentTypes();
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
        supportedDocumentTypes,
        resolveConflict,
      );
    },
    [selectedDriveId, selectedFolder],
  );

  return onDropFile;
};
