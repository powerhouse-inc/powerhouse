import type { PHDocument } from "document-model";
import { z } from "zod";
import { documentEditorDocumentType } from "./document-type.js";
import { DocumentEditorStateSchema } from "./schema/zod.js";
import type { DocumentEditorDocument } from "./types.js";

export const DocumentEditorDocumentSchema = z.object({
  header: z.object({
    id: z.string(),
    name: z.string(),
    createdAtUtcIso: z.string(),
    lastModifiedAtUtcIso: z.string(),
    documentType: z.literal(documentEditorDocumentType),
  }),
  state: z.object({
    global: DocumentEditorStateSchema(),
  }),
  initialState: z.object({
    global: DocumentEditorStateSchema(),
  }),
});

/** Simple helper function to check if a document is a DocumentEditor document */
export function isDocumentEditorDocument(
  document: PHDocument | undefined,
): document is DocumentEditorDocument {
  return DocumentEditorDocumentSchema.safeParse(document).success;
}

/** Simple helper function to assert that a document is a DocumentEditor document */
export function assertIsDocumentEditorDocument(
  document: PHDocument | undefined,
): asserts document is DocumentEditorDocument {
  DocumentEditorDocumentSchema.parse(document);
}
