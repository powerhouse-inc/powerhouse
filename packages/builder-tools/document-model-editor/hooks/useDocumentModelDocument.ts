import {
  useDocumentOfType,
  useSelectedDocumentOfType,
} from "@powerhousedao/reactor-browser";
import type {
  DocumentModelAction,
  DocumentModelDocument,
} from "document-model";

export function useDocumentModelDocument(
  documentId: string | undefined | null,
) {
  return useDocumentOfType<DocumentModelDocument, DocumentModelAction>(
    documentId,
    "powerhouse/document-model",
  );
}

export function useSelectedDocumentModelDocument() {
  return useSelectedDocumentOfType<DocumentModelDocument, DocumentModelAction>(
    "powerhouse/document-model",
  );
}
