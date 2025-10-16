import type { FolderNode } from "document-drive";
import { useFolderById } from "./folder-by-id.js";
import { useNodeById } from "./node-by-id.js";
import { useSelectedNode } from "./selected-node.js";

export function useNodeParentFolderById(
  id: string | null | undefined,
): FolderNode | undefined {
  const node = useNodeById(id);
  const parentFolder = useFolderById(node?.parentFolder);
  return parentFolder;
}

export function useParentFolderForSelectedNode() {
  const node = useSelectedNode();
  return useNodeParentFolderById(node?.id);
}
