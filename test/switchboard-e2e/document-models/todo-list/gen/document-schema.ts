import {
  BaseDocumentHeaderSchema,
  BaseDocumentStateSchema,
} from "document-model";
import { z } from "zod";
import { todoListDocumentType } from "./document-type.js";
import { TodoListStateSchema } from "./schema/zod.js";
import type { TodoListDocument, TodoListPHState } from "./types.js";

/** Schema for validating the header object of a TodoList document */
export const TodoListDocumentHeaderSchema = BaseDocumentHeaderSchema.extend({
  documentType: z.literal(todoListDocumentType),
});

/** Schema for validating the state object of a TodoList document */
export const TodoListPHStateSchema = BaseDocumentStateSchema.extend({
  global: TodoListStateSchema(),
});

export const TodoListDocumentSchema = z.object({
  header: TodoListDocumentHeaderSchema,
  state: TodoListPHStateSchema,
  initialState: TodoListPHStateSchema,
});

/** Simple helper function to check if a state object is a TodoList document state object */
export function isTodoListState(state: unknown): state is TodoListPHState {
  return TodoListPHStateSchema.safeParse(state).success;
}

/** Simple helper function to assert that a document state object is a TodoList document state object */
export function assertIsTodoListState(
  state: unknown,
): asserts state is TodoListPHState {
  TodoListPHStateSchema.parse(state);
}

/** Simple helper function to check if a document is a TodoList document */
export function isTodoListDocument(
  document: unknown,
): document is TodoListDocument {
  return TodoListDocumentSchema.safeParse(document).success;
}

/** Simple helper function to assert that a document is a TodoList document */
export function assertIsTodoListDocument(
  document: unknown,
): asserts document is TodoListDocument {
  TodoListDocumentSchema.parse(document);
}
