import type { Node } from "@powerhousedao/shared/document-drive";
import { useNodeById } from "./node-by-id.js";
import { useSelectedNodeId } from "./set-selected-node.js";

export {
  addResetSelectedNodeEventHandler,
  addSelectedNodeIdEventHandler,
  getNodeTarget,
  useNodeTarget,
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
  return useNodeById(useSelectedNodeId());
}
