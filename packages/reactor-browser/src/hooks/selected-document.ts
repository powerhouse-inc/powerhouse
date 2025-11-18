import type { DocumentDispatch } from "@powerhousedao/reactor-browser";
import { isFileNode } from "document-drive";
import type { Action, PHDocument } from "document-model";
import { NoSelectedDocumentError } from "../errors.js";
import { useDocumentById } from "./document-by-id.js";
import { useDocumentOfType } from "./document-of-type.js";
import { useSelectedNode } from "./selected-node.js";

/** Returns the selected document id */
export function useSelectedDocumentId() {
  const selectedNode = useSelectedNode();
  return selectedNode && isFileNode(selectedNode) ? selectedNode.id : undefined;
}

/** Returns the selected document. */
export function useSelectedDocument() {
  const selectedDocumentId = useSelectedDocumentId();
  return useDocumentById(selectedDocumentId);
}

/** Returns the selected document of a specific type, throws an error if the found document has a different type */
export function useSelectedDocumentOfType(
  documentType: null | undefined,
): never[];
export function useSelectedDocumentOfType<
  TDocument extends PHDocument,
  TAction extends Action,
>(documentType: string): [TDocument, DocumentDispatch<TAction>];
export function useSelectedDocumentOfType<
  TDocument extends PHDocument,
  TAction extends Action,
>(
  documentType: string | null | undefined,
): never[] | [TDocument, DocumentDispatch<TAction>] {
  const documentId = useSelectedDocumentId();

  if (!documentType) {
    return [];
  }
  if (!documentId) {
    throw new NoSelectedDocumentError();
  }
  return useDocumentOfType<TDocument, TAction>(documentId, documentType);
}
