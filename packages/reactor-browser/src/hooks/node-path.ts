import type { Node } from "document-drive";
import { useNodesInSelectedDrive } from "./items-in-selected-drive.js";
import { useSelectedNode } from "./selected-node.js";

/** Returns the path to a node in the selected drive */
export function useNodePathById(id: string | null | undefined) {
  const nodes = useNodesInSelectedDrive();
  if (!nodes) return [];

  const path: Node[] = [];
  let current = nodes.find((n) => n.id === id);

  while (current) {
    path.push(current);
    if (!current.parentFolder) break;
    current = nodes.find((n) => n.id === current?.parentFolder);
  }

  return path.reverse();
}

/** Returns the path to the currently selected node in the selected drive. */
export function useSelectedNodePath() {
  const selectedNode = useSelectedNode();
  return useNodePathById(selectedNode?.id);
}
