import type { FolderNode } from "document-drive";
import { isFolderNodeKind } from "../utils/nodes.js";
import { useSelectedNode } from "./selected-node.js";

/** Returns the selected folder. */
export function useSelectedFolder(): FolderNode | undefined {
  const selectedNode = useSelectedNode();
  if (isFolderNodeKind(selectedNode)) return selectedNode;
  return undefined;
}
