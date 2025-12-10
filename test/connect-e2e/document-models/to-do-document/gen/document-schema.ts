import {
  BaseDocumentHeaderSchema,
  BaseDocumentStateSchema,
} from "document-model";
import { z } from "zod";
import { toDoDocumentDocumentType } from "./document-type.js";
import { ToDoDocumentStateSchema } from "./schema/zod.js";
import type { ToDoDocumentDocument, ToDoDocumentPHState } from "./types.js";

/** Schema for validating the header object of a ToDoDocument document */
export const ToDoDocumentDocumentHeaderSchema = BaseDocumentHeaderSchema.extend(
  {
    documentType: z.literal(toDoDocumentDocumentType),
  },
);

/** Schema for validating the state object of a ToDoDocument document */
export const ToDoDocumentPHStateSchema = BaseDocumentStateSchema.extend({
  global: ToDoDocumentStateSchema(),
});

export const ToDoDocumentDocumentSchema = z.object({
  header: ToDoDocumentDocumentHeaderSchema,
  state: ToDoDocumentPHStateSchema,
  initialState: ToDoDocumentPHStateSchema,
});

/** Simple helper function to check if a state object is a ToDoDocument document state object */
export function isToDoDocumentState(
  state: unknown,
): state is ToDoDocumentPHState {
  return ToDoDocumentPHStateSchema.safeParse(state).success;
}

/** Simple helper function to assert that a document state object is a ToDoDocument document state object */
export function assertIsToDoDocumentState(
  state: unknown,
): asserts state is ToDoDocumentPHState {
  ToDoDocumentPHStateSchema.parse(state);
}

/** Simple helper function to check if a document is a ToDoDocument document */
export function isToDoDocumentDocument(
  document: unknown,
): document is ToDoDocumentDocument {
  return ToDoDocumentDocumentSchema.safeParse(document).success;
}

/** Simple helper function to assert that a document is a ToDoDocument document */
export function assertIsToDoDocumentDocument(
  document: unknown,
): asserts document is ToDoDocumentDocument {
  ToDoDocumentDocumentSchema.parse(document);
}
