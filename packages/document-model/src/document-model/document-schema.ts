import { z } from "zod";
import { documentModelDocumentType } from "./document-type.js";
import { DocumentModelGlobalStateSchema } from "./schemas.js";
import type { DocumentModelDocument, DocumentModelPHState } from "./types.js";

export const BaseDocumentHeaderSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAtUtcIso: z.string(),
  lastModifiedAtUtcIso: z.string(),
  documentType: z.string(),
});

export const BaseDocumentStateSchema = z.object({
  global: z.unknown(),
});

/** Schema for validating the header object of a DocumentModel document */
export const DocumentModelHeaderSchema = BaseDocumentHeaderSchema.extend({
  documentType: z.literal(documentModelDocumentType),
});

/** Schema for validating the state object of a DocumentModel document */
export const DocumentModelPHStateSchema = BaseDocumentStateSchema.extend({
  global: DocumentModelGlobalStateSchema(),
});

export const DocumentModelSchema = z.object({
  header: DocumentModelHeaderSchema,
  state: DocumentModelPHStateSchema,
  initialState: DocumentModelPHStateSchema,
});

/** Simple helper function to check if a state object is a DocumentModel document state object */
export function isDocumentModelState(
  state: unknown,
): state is DocumentModelPHState {
  return DocumentModelPHStateSchema.safeParse(state).success;
}

/** Simple helper function to assert that a document state object is a DocumentModel document state object */
export function assertIsDocumentModelState(
  state: unknown,
): asserts state is DocumentModelPHState {
  DocumentModelPHStateSchema.parse(state);
}

/** Simple helper function to check if a document is a DocumentModel document */
export function isDocumentModelDocument(
  document: unknown,
): document is DocumentModelDocument {
  return DocumentModelSchema.safeParse(document).success;
}

/** Simple helper function to assert that a document is a DocumentModel document */
export function assertIsDocumentModelDocument(
  document: unknown,
): asserts document is DocumentModelDocument {
  DocumentModelSchema.parse(document);
}
