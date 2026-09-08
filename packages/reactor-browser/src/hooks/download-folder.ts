import type { FolderNode } from "@powerhousedao/shared/document-drive";
import { downloadFolderZip } from "../actions/folder-zip.js";
import { useSelectedDriveSafe } from "./selected-drive.js";
import { usePHToast } from "./toast.js";

/**
 * Downloads the selected drive's folder (or the whole drive when no folder
 * is given) as a single zip archive mirroring the folder tree.
 */
export function useDownloadFolder(folderNode?: FolderNode) {
  const [selectedDrive] = useSelectedDriveSafe();
  const toast = usePHToast();

  return async () => {
    if (!selectedDrive) return;
    const name = folderNode?.name ?? selectedDrive.header.name;
    toast?.(`Downloading "${name}"…`);
    try {
      const { entryCount, failed } = await downloadFolderZip(
        selectedDrive,
        folderNode,
      );
      toast?.(
        failed.length
          ? `Downloaded ${entryCount} files (${failed.length} failed)`
          : `Downloaded ${entryCount} files`,
      );
    } catch (error) {
      toast?.(`Failed to download "${name}": ${(error as Error).message}`);
    }
  };
}
