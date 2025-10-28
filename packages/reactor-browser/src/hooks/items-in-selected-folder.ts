import type { FileNode, FolderNode, Node } from "document-drive";
import type { PHDocument } from "document-model";
import { isFileNodeKind, isFolderNodeKind } from "../utils/nodes.js";
import {
  useDocumentsInSelectedDrive,
  useNodesInSelectedDrive,
} from "./items-in-selected-drive.js";
import { useSelectedFolder } from "./selected-folder.js";

/** Returns the nodes in the selected folder. */
export function useNodesInSelectedFolder(): Node[] | undefined {
  const selectedFolder = useSelectedFolder();
  const nodes = useNodesInSelectedDrive();
  if (!selectedFolder || !nodes) return undefined;

  return nodes.filter((n) => n.parentFolder === selectedFolder.id);
}

/** Returns the file nodes in the selected folder. */
export function useFileNodesInSelectedFolder(): FileNode[] | undefined {
  const nodes = useNodesInSelectedFolder();
  if (!nodes) return undefined;
  return nodes.filter((n) => isFileNodeKind(n));
}

/** Returns the folder nodes in the selected folder. */
export function useFolderNodesInSelectedFolder(): FolderNode[] | undefined {
  const nodes = useNodesInSelectedFolder();
  if (!nodes) return undefined;
  return nodes.filter((n) => isFolderNodeKind(n));
}

/** Returns the documents in the selected folder. */
export function useDocumentsInSelectedFolder(): PHDocument[] | undefined {
  const documents = useDocumentsInSelectedDrive();
  const fileNodes = useFileNodesInSelectedFolder();
  const fileNodeIds = fileNodes?.map((node) => node.id);
  return documents?.filter((d) => fileNodeIds?.includes(d.header.id));
}
