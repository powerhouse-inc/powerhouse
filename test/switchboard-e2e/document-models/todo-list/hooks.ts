import type { DocumentDispatch } from "@powerhousedao/reactor-browser";
import {
  useDocumentsInSelectedDrive,
  useDocumentsInSelectedFolder,
  useDocumentById,
  useSelectedDocument,
} from "@powerhousedao/reactor-browser";
import type {
  TodoListDocument,
  TodoListAction,
} from "@powerhousedao/todo-demo/document-models/todo-list";
import { isTodoListDocument } from "./gen/document-schema.js";

/** Hook to get a TodoList document by its id */
export function useTodoListDocumentById(
  documentId: string | null | undefined,
):
  | [TodoListDocument, DocumentDispatch<TodoListAction>]
  | [undefined, undefined] {
  const [document, dispatch] = useDocumentById(documentId);
  if (!isTodoListDocument(document)) return [undefined, undefined];
  return [document, dispatch];
}

/** Hook to get the selected TodoList document */
export function useSelectedTodoListDocument():
  | [TodoListDocument, DocumentDispatch<TodoListAction>]
  | [undefined, undefined] {
  const [document, dispatch] = useSelectedDocument();
  if (!isTodoListDocument(document)) return [undefined, undefined];
  return [document, dispatch];
}

/** Hook to get all TodoList documents in the selected drive */
export function useTodoListDocumentsInSelectedDrive() {
  const documentsInSelectedDrive = useDocumentsInSelectedDrive();
  return documentsInSelectedDrive?.filter(isTodoListDocument);
}

/** Hook to get all TodoList documents in the selected folder */
export function useTodoListDocumentsInSelectedFolder() {
  const documentsInSelectedFolder = useDocumentsInSelectedFolder();
  return documentsInSelectedFolder?.filter(isTodoListDocument);
}
