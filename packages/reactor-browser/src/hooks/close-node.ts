import { useNodeParentFolderById } from "./parent-folder.js";
import { useSetSelectedNode } from "./set-selected-node.js";
import { usePHNavigation } from "./url-state.js";

/** Leaves a node's view: back to the entry it was opened from, past entries
 * pushed inside it; else, e.g. after a deep link, to its parent in place. */
export function useCloseNode(nodeId: string | null | undefined) {
  const navigation = usePHNavigation();
  const setSelectedNode = useSetSelectedNode();
  const parentFolder = useNodeParentFolderById(nodeId);
  return () => {
    if (navigation.closeOpened?.()) return;
    setSelectedNode(parentFolder, { replace: true });
  };
}
