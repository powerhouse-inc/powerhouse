import type { Node } from "@powerhousedao/shared/document-drive";
import { useNodeById } from "./node-by-id.js";
import { useSelectedNodeId } from "./set-selected-node.js";

export {
  addResetSelectedNodeEventHandler,
  getNodeTarget,
  useNodeTarget,
  preloadNode,
  setSelectedNode,
  useOpenNode,
  usePreloadNode,
  useSetSelectedNode,
} from "./set-selected-node.js";

/** Returns the selected node. */
export function useSelectedNode(): Node | undefined {
  return useNodeById(useSelectedNodeId());
}
