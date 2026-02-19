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
): ReturnType<
  typeof useDocumentOfType<DocumentModelDocument, DocumentModelAction>
> {
  return useDocumentOfType<DocumentModelDocument, DocumentModelAction>(
    documentId,
    "powerhouse/document-model",
  );
}

export function useSelectedDocumentModelDocument(): ReturnType<
  typeof useSelectedDocumentOfType<DocumentModelDocument, DocumentModelAction>
> {
  return useSelectedDocumentOfType<DocumentModelDocument, DocumentModelAction>(
    "powerhouse/document-model",
  );
}
