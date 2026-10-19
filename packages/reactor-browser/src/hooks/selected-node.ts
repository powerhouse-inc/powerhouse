import type { Node } from "@powerhousedao/shared/document-drive";
import { useNodesInSelectedDrive } from "./items-in-selected-drive.js";
import { useSelectedNodeId } from "./set-selected-node.js";

export {
  addResetSelectedNodeEventHandler,
  addSelectedNodeIdEventHandler,
  getNodeTarget,
  getNodeTargetIn,
  preloadNode,
  setSelectedNode,
  setSelectedNodeId,
  useOpenNode,
  usePreloadNode,
  useSetSelectedNode,
} from "./set-selected-node.js";
export { addSetSelectedNodeOnPopStateEventHandler } from "./sync-selection.js";

/** Returns the selected node. */
export function useSelectedNode(): Node | undefined {
  const selectedNodeId = useSelectedNodeId();
  const nodes = useNodesInSelectedDrive();
  return nodes?.find((n) => n.id === selectedNodeId);
}
