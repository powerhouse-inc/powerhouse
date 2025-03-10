import { type SyncStatus } from "../types/index.js";

export type FileStatus = { path: string; status?: SyncStatus };

/**
 * Retrieves the sync status of a folder based on its path and their children files.
 *
 * @param folderPath - The path of the folder.
 * @param sortedFiles - The sorted list of files.
 * @returns The sync status of the folder.
 */
export const getFolderStatus = (
  folderPath: string,
  sortedFiles: FileStatus[],
): SyncStatus => {
  for (const file of sortedFiles) {
    if (file.path.startsWith(folderPath)) {
      return file.status || "SUCCESS";
    }
  }

  return "SUCCESS";
};

/**
 * Sorts an array of files by their status.
 * The order priority is:
 * - ERROR
 * - CONFLICT
 * - SYNCING
 * - MISSING
 * - SUCCESS
 *
 * @param files - The array of files to be sorted.
 * @returns The sorted array of files.
 */
export const sortFilesByStatus = (files: FileStatus[]) => {
  return files.sort((a, b) => {
    const statusOrder = [
      "ERROR",
      "CONFLICT",
      "SYNCING",
      "MISSING",
      "SYNCING",
      "SUCCESS",
    ];

    return (
      statusOrder.indexOf(a.status || "SUCCESS") -
      statusOrder.indexOf(b.status || "SUCCESS")
    );
  });
};

/**
 * Removes files with a status of 'SUCCESS' from the given array of FileStatus objects.
 * @param files - An array of FileStatus objects.
 * @returns A new array containing only the FileStatus objects with a status other than 'SUCCESS'.
 */
export const removeSuccessFiles = (files: FileStatus[]) => {
  return files.filter((file) => file.status !== "SUCCESS");
};
