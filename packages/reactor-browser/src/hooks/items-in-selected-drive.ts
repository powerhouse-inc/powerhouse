import type { FileNode, FolderNode } from "document-drive";
import type { PHDocument } from "document-model";
import { isFileNodeKind, isFolderNodeKind } from "../utils/nodes.js";
import { useAllDocuments } from "./all-documents.js";
import { useSelectedDriveSafe } from "./selected-drive.js";

/** Returns the nodes in the selected drive. */
export function useNodesInSelectedDrive() {
  const [selectedDrive] = useSelectedDriveSafe();
  return selectedDrive?.state.global.nodes;
}

/** Returns the file nodes in the selected drive. */
export function useFileNodesInSelectedDrive(): FileNode[] | undefined {
  const nodes = useNodesInSelectedDrive();
  return nodes?.filter((n) => isFileNodeKind(n));
}

/** Returns the folder nodes in the selected drive. */
export function useFolderNodesInSelectedDrive(): FolderNode[] | undefined {
  const nodes = useNodesInSelectedDrive();
  return nodes?.filter((n) => isFolderNodeKind(n));
}

/** Returns the documents in the selected drive. */
export function useDocumentsInSelectedDrive(): PHDocument[] | undefined {
  const documents = useAllDocuments();
  const fileNodes = useFileNodesInSelectedDrive();
  const fileNodeIds = fileNodes?.map((node) => node.id);
  return documents?.filter((d) => fileNodeIds?.includes(d.header.id));
}
