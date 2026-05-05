/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { DocumentDispatch } from "@powerhousedao/reactor-browser";
import {
  useDocumentById,
  useDocumentsInSelectedDrive,
  useDocumentsInSelectedFolder,
  useSelectedDocument,
} from "@powerhousedao/reactor-browser";
import type { TodoAction, TodoDocument } from "document-models/todo/v2";
import { assertIsTodoDocument, isTodoDocument } from "./gen/document-schema.js";

/** Hook to get a Todo document by its id */
export function useTodoDocumentById(
  documentId: string | null | undefined,
): [TodoDocument, DocumentDispatch<TodoAction>] | [undefined, undefined] {
  const [document, dispatch] = useDocumentById(documentId);
  if (!isTodoDocument(document)) return [undefined, undefined];
  return [document, dispatch];
}

/** Hook to get the selected Todo document */
export function useSelectedTodoDocument(): [
  TodoDocument,
  DocumentDispatch<TodoAction>,
] {
  const [document, dispatch] = useSelectedDocument();

  assertIsTodoDocument(document);
  return [document, dispatch] as const;
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
