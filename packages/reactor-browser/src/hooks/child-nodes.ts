import type { Node } from "document-drive";
import { sortNodesByName } from "../utils/nodes.js";
import { useNodesInSelectedDrive } from "./items-in-selected-drive.js";
import { useSelectedFolder } from "./selected-folder.js";

/** Returns the child nodes for the selected drive or folder. */
export function useNodesInSelectedDriveOrFolder(): Node[] {
  const nodes = useNodesInSelectedDrive();
  const selectedFolder = useSelectedFolder();
  const selectedFolderId = selectedFolder?.id;
  if (!nodes) return [];
  if (!selectedFolderId) return sortNodesByName(nodes);
  return sortNodesByName(
    nodes.filter((n) => n.parentFolder === selectedFolderId),
  );
}
