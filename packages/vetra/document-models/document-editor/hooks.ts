import type { DocumentDispatch } from "@powerhousedao/reactor-browser";
import {
  useDocumentById,
  useDocumentsInSelectedDrive,
  useDocumentsInSelectedFolder,
  useSelectedDocument,
} from "@powerhousedao/reactor-browser";
import type {
  DocumentEditorAction,
  DocumentEditorDocument,
} from "@powerhousedao/vetra/document-models/document-editor";
import {
  assertIsDocumentEditorDocument,
  isDocumentEditorDocument,
} from "./gen/document-schema.js";

/** Hook to get a DocumentEditor document by its id */
export function useDocumentEditorDocumentById(
  documentId: string | null | undefined,
):
  | [DocumentEditorDocument, DocumentDispatch<DocumentEditorAction>]
  | [undefined, undefined] {
  const [document, dispatch] = useDocumentById(documentId);
  if (!isDocumentEditorDocument(document)) return [undefined, undefined];
  return [document, dispatch];
}

/** Hook to get the selected DocumentEditor document */
export function useSelectedDocumentEditorDocument(): [
  DocumentEditorDocument,
  DocumentDispatch<DocumentEditorAction>,
] {
  const [document, dispatch] = useSelectedDocument();
  assertIsDocumentEditorDocument(document);
  return [document, dispatch] as const;
}

/** Hook to get all DocumentEditor documents in the selected drive */
export function useDocumentEditorDocumentsInSelectedDrive() {
  const documentsInSelectedDrive = useDocumentsInSelectedDrive();
  return documentsInSelectedDrive?.filter(isDocumentEditorDocument);
}

/** Hook to get all DocumentEditor documents in the selected folder */
export function useDocumentEditorDocumentsInSelectedFolder() {
  const documentsInSelectedFolder = useDocumentsInSelectedFolder();
  return documentsInSelectedFolder?.filter(isDocumentEditorDocument);
}
