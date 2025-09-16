---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/hooks/useOnDropFile.ts"
unless_exists: true
---
import {
  addFileWithProgress,
  useSelectedDrive,
  useSelectedFolder,
  type FileUploadProgressCallback,
} from "@powerhousedao/reactor-browser";
import { useCallback } from "react";

export const useOnDropFile = (documentTypes: string[] = []) => {
  const [selectedDrive] = useSelectedDrive();
  const selectedDriveId = selectedDrive?.header.id;
  const selectedFolder = useSelectedFolder();

  const onDropFile = useCallback(
    async (file: File, onProgress?: FileUploadProgressCallback) => {
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
      );
    },
    [selectedDriveId, selectedFolder],
  );

  return onDropFile;
};