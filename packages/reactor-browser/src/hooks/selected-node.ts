import type { Node } from "@powerhousedao/shared/document-drive";
import { useNodesInSelectedDrive } from "./items-in-selected-drive.js";
import { useSelectedNodeId } from "./set-selected-node.js";

export {
  addResetSelectedNodeEventHandler,
  addSelectedNodeIdEventHandler,
  addSetSelectedNodeOnPopStateEventHandler,
  setSelectedNode,
} from "./set-selected-node.js";

/** Returns the selected node. */
export function useSelectedNode(): Node | undefined {
  const selectedNodeId = useSelectedNodeId();
  const nodes = useNodesInSelectedDrive();
  return nodes?.find((n) => n.id === selectedNodeId);
}
