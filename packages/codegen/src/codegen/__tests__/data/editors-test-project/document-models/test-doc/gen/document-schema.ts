import type { PHDocument } from "document-model";
import { z } from "zod";
import { testDocDocumentType } from "./document-type.js";
import { TestDocStateSchema } from "./schema/zod.js";
import type { TestDocDocument } from "./types.js";

export const TestDocDocumentSchema = z.object({
  header: z.object({
    id: z.string(),
    name: z.string(),
    createdAtUtcIso: z.string(),
    lastModifiedAtUtcIso: z.string(),
    documentType: z.literal(testDocDocumentType),
  }),
  state: z.object({
    global: TestDocStateSchema(),
  }),
  initialState: z.object({
    global: TestDocStateSchema(),
  }),
});

/** Simple helper function to check if a document is a TestDoc document */
export function isTestDocDocument(
  document: PHDocument | undefined,
): document is TestDocDocument {
  return TestDocDocumentSchema.safeParse(document).success;
}

/** Simple helper function to assert that a document is a TestDoc document */
export function assertIsTestDocDocument(
  document: PHDocument | undefined,
): asserts document is TestDocDocument {
  TestDocDocumentSchema.parse(document);
}
