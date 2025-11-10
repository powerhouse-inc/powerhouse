import type { FileNode, FolderNode } from "document-drive";
import type { DocumentModelDocument, PHDocument } from "document-model";
import { isFileNodeKind, isFolderNodeKind } from "../utils/nodes.js";
import { useDocumentsByIds } from "./document-by-id.js";
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
  const fileNodes = useFileNodesInSelectedDrive();
  const fileNodeIds = fileNodes?.map((node) => node.id);
  return useDocumentsByIds(fileNodeIds);
}

/** Returns the document types supported by the selected drive, as defined by the document model documents present in the drive */
export function useDocumentTypesInSelectedDrive() {
  const documentsInSelectedDrive = useDocumentsInSelectedDrive();
  const documentModelDocumentsInSelectedDrive =
    documentsInSelectedDrive?.filter(isDocumentModelDocument);
  const documentTypesFromDocumentModelDocuments =
    documentModelDocumentsInSelectedDrive?.map((doc) => doc.state.global.id);
  return documentTypesFromDocumentModelDocuments;
}

function isDocumentModelDocument(
  document: PHDocument,
): document is DocumentModelDocument {
  return document.header.documentType === "powerhouse/document-model";
}
