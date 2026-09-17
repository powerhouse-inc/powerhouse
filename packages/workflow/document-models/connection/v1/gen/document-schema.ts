/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import {
  BaseDocumentHeaderSchema,
  BaseDocumentStateSchema,
} from "document-model";
import { z } from "zod";
import { connectionDocumentType } from "./document-type.js";
import { ConnectionStateSchema } from "./schema/zod.js";
import type { ConnectionDocument, ConnectionPHState } from "./types.js";

/** Schema for validating the header object of a Connection document */
export const ConnectionDocumentHeaderSchema = BaseDocumentHeaderSchema.extend({
  documentType: z.literal(connectionDocumentType),
});

/** Schema for validating the state object of a Connection document */
export const ConnectionPHStateSchema = BaseDocumentStateSchema.extend({
  global: ConnectionStateSchema(),
});

export const ConnectionDocumentSchema = z.object({
  header: ConnectionDocumentHeaderSchema,
  state: ConnectionPHStateSchema,
  initialState: ConnectionPHStateSchema,
});

/** Simple helper function to check if a state object is a Connection document state object */
export function isConnectionState(state: unknown): state is ConnectionPHState {
  return ConnectionPHStateSchema.safeParse(state).success;
}

/** Simple helper function to assert that a document state object is a Connection document state object */
export function assertIsConnectionState(
  state: unknown,
): asserts state is ConnectionPHState {
  ConnectionPHStateSchema.parse(state);
}

/** Simple helper function to check if a document is a Connection document */
export function isConnectionDocument(
  document: unknown,
): document is ConnectionDocument {
  return ConnectionDocumentSchema.safeParse(document).success;
}

/** Simple helper function to assert that a document is a Connection document */
export function assertIsConnectionDocument(
  document: unknown,
): asserts document is ConnectionDocument {
  ConnectionDocumentSchema.parse(document);
}
