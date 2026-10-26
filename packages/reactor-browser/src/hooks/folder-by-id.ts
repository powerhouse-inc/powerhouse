import type { FolderNode } from "@powerhousedao/shared/document-drive";
import { isFolderNodeKind } from "../utils/nodes.js";
import { useNodeById } from "./node-by-id.js";

export function useFolderById(
  id: string | null | undefined,
): FolderNode | undefined {
  const node = useNodeById(id);
  return isFolderNodeKind(node) ? node : undefined;
}
