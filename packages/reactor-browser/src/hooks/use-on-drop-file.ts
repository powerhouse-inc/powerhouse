import { useCallback } from "react";
import { addFileWithProgress } from "../actions/document.js";
import type {
  ConflictResolution,
  FileUploadProgressCallback,
  UseOnDropFile,
} from "../types/upload.js";
import { useAllowedDocumentTypes } from "./config/editor.js";
import { useSelectedDriveSafe } from "./selected-drive.js";
import { useSelectedFolder } from "./selected-folder.js";

export const useOnDropFile: UseOnDropFile = () => {
  const [selectedDrive] = useSelectedDriveSafe();
  const allowedDocumentTypes = useAllowedDocumentTypes();
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
        allowedDocumentTypes,
        resolveConflict,
      );
    },
    [selectedDriveId, selectedFolder],
  );

  return onDropFile;
};
