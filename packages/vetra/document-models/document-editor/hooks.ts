import type { DocumentDispatch } from "@powerhousedao/reactor-browser";
import {
  useDocumentsInSelectedDrive,
  useDocumentsInSelectedFolder,
  useDocumentById,
  useSelectedDocument,
} from "@powerhousedao/reactor-browser";
import type {
  DocumentEditorDocument,
  DocumentEditorAction,
} from "@powerhousedao/vetra/document-models/document-editor";
import { isDocumentEditorDocument } from "@powerhousedao/vetra/document-models/document-editor";

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
export function useSelectedDocumentEditorDocument():
  | [DocumentEditorDocument, DocumentDispatch<DocumentEditorAction>]
  | [undefined, undefined] {
  const [document, dispatch] = useSelectedDocument();
  if (!isDocumentEditorDocument(document)) return [undefined, undefined];
  return [document, dispatch];
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
