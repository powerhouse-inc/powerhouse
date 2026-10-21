import type { FolderNode } from "@powerhousedao/shared/document-drive";
import { isFolderNodeKind } from "../utils/nodes.js";
import { useDriveContext } from "./drive-context.js";
import { useSelectedNode } from "./selected-node.js";

/** Returns the selected folder: the drive app's open folder, else the app's. */
export function useSelectedFolder(): FolderNode | undefined {
  const context = useDriveContext();
  const selectedNode = useSelectedNode();
  if (context?.folder) return context.folder;
  if (isFolderNodeKind(selectedNode)) return selectedNode;
  return undefined;
}
