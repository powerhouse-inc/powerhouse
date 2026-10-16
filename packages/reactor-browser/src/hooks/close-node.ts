import { useNodeParentFolderById } from "./parent-folder.js";
import { usePHStore } from "./ph-store.js";
import { selectNodeIn } from "./set-selected-node.js";
import { usePHNavigation } from "./url-state.js";

/** Leaves a node's view: back to the entry it was opened from, past entries
 * pushed inside it; else, e.g. after a deep link, to its parent in place. */
export function useCloseNode(nodeId: string | null | undefined) {
  const store = usePHStore();
  const navigation = usePHNavigation();
  const parentFolder = useNodeParentFolderById(nodeId);
  return () => {
    if (navigation.closeOpened?.()) return;
    selectNodeIn(store, parentFolder, { replace: true });
  };
}
