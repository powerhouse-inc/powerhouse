import { useDocumentOfType } from "@powerhousedao/reactor-browser";
import type {
  DocumentModelAction,
  DocumentModelDocument,
} from "document-model";

export function useDocumentModelDocument(documentId: string) {
  return useDocumentOfType<DocumentModelDocument, DocumentModelAction>(
    documentId,
    "powerhouse/document-model",
  );
}
