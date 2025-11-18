import {
  BaseDocumentHeaderSchema,
  BaseDocumentStateSchema,
} from "document-model";
import { z } from "zod";
import { documentEditorDocumentType } from "./document-type.js";
import { DocumentEditorStateSchema } from "./schema/zod.js";
import type { DocumentEditorDocument, DocumentEditorPHState } from "./types.js";

/** Schema for validating the header object of a DocumentEditor document */
export const DocumentEditorDocumentHeaderSchema =
  BaseDocumentHeaderSchema.extend({
    documentType: z.literal(documentEditorDocumentType),
  });

/** Schema for validating the state object of a DocumentEditor document */
export const DocumentEditorPHStateSchema = BaseDocumentStateSchema.extend({
  global: DocumentEditorStateSchema(),
});

export const DocumentEditorDocumentSchema = z.object({
  header: DocumentEditorDocumentHeaderSchema,
  state: DocumentEditorPHStateSchema,
  initialState: DocumentEditorPHStateSchema,
});

/** Simple helper function to check if a state object is a DocumentEditor document state object */
export function isDocumentEditorState(
  state: unknown,
): state is DocumentEditorPHState {
  return DocumentEditorPHStateSchema.safeParse(state).success;
}

/** Simple helper function to assert that a document state object is a DocumentEditor document state object */
export function assertIsDocumentEditorState(
  state: unknown,
): asserts state is DocumentEditorPHState {
  DocumentEditorPHStateSchema.parse(state);
}

/** Simple helper function to check if a document is a DocumentEditor document */
export function isDocumentEditorDocument(
  document: unknown,
): document is DocumentEditorDocument {
  return DocumentEditorDocumentSchema.safeParse(document).success;
}

/** Simple helper function to assert that a document is a DocumentEditor document */
export function assertIsDocumentEditorDocument(
  document: unknown,
): asserts document is DocumentEditorDocument {
  DocumentEditorDocumentSchema.parse(document);
}
