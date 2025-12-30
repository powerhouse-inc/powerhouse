import type { DocumentDispatch } from "@powerhousedao/reactor-browser";
import {
  useDocumentsInSelectedDrive,
  useDocumentsInSelectedFolder,
  useDocumentById,
  useSelectedDocument,
} from "@powerhousedao/reactor-browser";
import type {
  TodoDocument,
  TodoAction,
} from "versioned-documents/document-models/todo/v1";
import { isTodoDocument } from "./gen/document-schema.js";

/** Hook to get a Todo document by its id */
export function useTodoDocumentById(
  documentId: string | null | undefined,
): [TodoDocument, DocumentDispatch<TodoAction>] | [undefined, undefined] {
  const [document, dispatch] = useDocumentById(documentId);
  if (!isTodoDocument(document)) return [undefined, undefined];
  return [document, dispatch];
}

/** Hook to get the selected Todo document */
export function useSelectedTodoDocument():
  | [TodoDocument, DocumentDispatch<TodoAction>]
  | [undefined, undefined] {
  const [document, dispatch] = useSelectedDocument();
  if (!isTodoDocument(document)) return [undefined, undefined];
  return [document, dispatch];
}

/** Hook to get all Todo documents in the selected drive */
export function useTodoDocumentsInSelectedDrive() {
  const documentsInSelectedDrive = useDocumentsInSelectedDrive();
  return documentsInSelectedDrive?.filter(isTodoDocument);
}

/** Hook to get all Todo documents in the selected folder */
export function useTodoDocumentsInSelectedFolder() {
  const documentsInSelectedFolder = useDocumentsInSelectedFolder();
  return documentsInSelectedFolder?.filter(isTodoDocument);
}
