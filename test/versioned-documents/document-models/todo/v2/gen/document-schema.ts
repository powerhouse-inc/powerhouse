import {
  BaseDocumentHeaderSchema,
  BaseDocumentStateSchema,
} from "document-model";
import { z } from "zod";
import { todoDocumentType } from "./document-type.js";
import { TodoStateSchema } from "./schema/zod.js";
import type { TodoDocument, TodoPHState } from "./types.js";

/** Schema for validating the header object of a Todo document */
export const TodoDocumentHeaderSchema = BaseDocumentHeaderSchema.extend({
  documentType: z.literal(todoDocumentType),
});

/** Schema for validating the state object of a Todo document */
export const TodoPHStateSchema = BaseDocumentStateSchema.extend({
  global: TodoStateSchema(),
});

export const TodoDocumentSchema = z.object({
  header: TodoDocumentHeaderSchema,
  state: TodoPHStateSchema,
  initialState: TodoPHStateSchema,
});

/** Simple helper function to check if a state object is a Todo document state object */
export function isTodoState(state: unknown): state is TodoPHState {
  return TodoPHStateSchema.safeParse(state).success;
}

/** Simple helper function to assert that a document state object is a Todo document state object */
export function assertIsTodoState(
  state: unknown,
): asserts state is TodoPHState {
  TodoPHStateSchema.parse(state);
}

/** Simple helper function to check if a document is a Todo document */
export function isTodoDocument(document: unknown): document is TodoDocument {
  return TodoDocumentSchema.safeParse(document).success;
}

/** Simple helper function to assert that a document is a Todo document */
export function assertIsTodoDocument(
  document: unknown,
): asserts document is TodoDocument {
  TodoDocumentSchema.parse(document);
}
