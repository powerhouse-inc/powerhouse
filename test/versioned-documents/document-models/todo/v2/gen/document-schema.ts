/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import {
  BaseDocumentHeaderSchema,
  BaseDocumentStateSchema,
  normalizeDocumentModelVersion,
} from "document-model";
import { z } from "zod";
import { TodoPHStateSchema as TodoPHStateSchemaV1 } from "../../v1/gen/document-schema.js";
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

const TodoPHStateSchemasByVersion: Record<number, z.ZodType> = {
  1: TodoPHStateSchemaV1,
  2: TodoPHStateSchema,
};

const TodoDocumentSchemasByVersion: Record<number, z.ZodType> = {
  1: z.object({
    header: TodoDocumentHeaderSchema,
    state: TodoPHStateSchemaV1,
    initialState: TodoPHStateSchemaV1,
  }),
  2: TodoDocumentSchema,
};

/** The document model version stamped in a state's document scope. States stamped with 0 or nothing predate versioning and are treated as version 1. */
function stampedDocumentModelVersion(state: unknown): number {
  if (typeof state !== "object" || state === null) return 1;
  const documentScope = (state as { document?: unknown }).document;
  if (typeof documentScope !== "object" || documentScope === null) return 1;
  const version = (documentScope as { version?: unknown }).version;
  return normalizeDocumentModelVersion(
    typeof version === "number" ? version : undefined,
  );
}

function resolveTodoPHStateSchema(state: unknown): z.ZodType {
  const schema =
    TodoPHStateSchemasByVersion[stampedDocumentModelVersion(state)];
  return schema ?? TodoPHStateSchema;
}

function resolveTodoDocumentSchema(document: unknown): z.ZodType {
  const state =
    typeof document === "object" && document !== null
      ? (document as { state?: unknown }).state
      : undefined;
  const schema =
    TodoDocumentSchemasByVersion[stampedDocumentModelVersion(state)];
  return schema ?? TodoDocumentSchema;
}

/** Simple helper function to check if a state object is a Todo document state object. Validates against the schema of the version the state is stamped with. */
export function isTodoState(state: unknown): state is TodoPHState {
  return resolveTodoPHStateSchema(state).safeParse(state).success;
}

/** Simple helper function to assert that a document state object is a Todo document state object. Validates against the schema of the version the state is stamped with. */
export function assertIsTodoState(
  state: unknown,
): asserts state is TodoPHState {
  resolveTodoPHStateSchema(state).parse(state);
}

/** Simple helper function to check if a document is a Todo document. Validates against the schema of the version the document is stamped with, so documents on older versions remain valid until they are upgraded. */
export function isTodoDocument(document: unknown): document is TodoDocument {
  return resolveTodoDocumentSchema(document).safeParse(document).success;
}

/** Simple helper function to assert that a document is a Todo document. Validates against the schema of the version the document is stamped with, so documents on older versions remain valid until they are upgraded. */
export function assertIsTodoDocument(
  document: unknown,
): asserts document is TodoDocument {
  resolveTodoDocumentSchema(document).parse(document);
}
