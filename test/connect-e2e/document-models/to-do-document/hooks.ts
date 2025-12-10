import type { DocumentDispatch } from "@powerhousedao/reactor-browser";
import {
  useDocumentsInSelectedDrive,
  useDocumentsInSelectedFolder,
  useDocumentById,
  useSelectedDocument,
} from "@powerhousedao/reactor-browser";
import type {
  ToDoDocumentDocument,
  ToDoDocumentAction,
} from "connect-e2e/document-models/to-do-document";
import { isToDoDocumentDocument } from "./gen/document-schema.js";

/** Hook to get a ToDoDocument document by its id */
export function useToDoDocumentDocumentById(
  documentId: string | null | undefined,
):
  | [ToDoDocumentDocument, DocumentDispatch<ToDoDocumentAction>]
  | [undefined, undefined] {
  const [document, dispatch] = useDocumentById(documentId);
  if (!isToDoDocumentDocument(document)) return [undefined, undefined];
  return [document, dispatch];
}

/** Hook to get the selected ToDoDocument document */
export function useSelectedToDoDocumentDocument():
  | [ToDoDocumentDocument, DocumentDispatch<ToDoDocumentAction>]
  | [undefined, undefined] {
  const [document, dispatch] = useSelectedDocument();
  if (!isToDoDocumentDocument(document)) return [undefined, undefined];
  return [document, dispatch];
}

/** Hook to get all ToDoDocument documents in the selected drive */
export function useToDoDocumentDocumentsInSelectedDrive() {
  const documentsInSelectedDrive = useDocumentsInSelectedDrive();
  return documentsInSelectedDrive?.filter(isToDoDocumentDocument);
}

/** Hook to get all ToDoDocument documents in the selected folder */
export function useToDoDocumentDocumentsInSelectedFolder() {
  const documentsInSelectedFolder = useDocumentsInSelectedFolder();
  return documentsInSelectedFolder?.filter(isToDoDocumentDocument);
}
