import { addFileWithProgress } from "../actions/document.js";
import type {
  ConflictResolution,
  FileUploadProgressCallback,
  UseOnDropFile,
} from "../types/upload.js";
import { useDocumentTypes } from "./document-types.js";
import { useSelectedDriveId } from "./selected-drive.js";
import { useSelectedFolder } from "./selected-folder.js";

export const useOnDropFile: UseOnDropFile = (
  documentTypesOverride?: string[],
) => {
  const selectedDriveId = useSelectedDriveId();
  const selectedFolder = useSelectedFolder();
  const documentTypes = useDocumentTypes();

  const onDropFile = async (
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
      documentTypesOverride ?? documentTypes,
      resolveConflict,
    );
  };

  return onDropFile;
};
