import type { FolderNode } from "document-drive";
import { useFolderNodesInSelectedDrive } from "./items-in-selected-drive.js";

export function useFolderById(
  id: string | null | undefined,
): FolderNode | undefined {
  const folders = useFolderNodesInSelectedDrive();
  return folders?.find((n) => n.id === id);
}
