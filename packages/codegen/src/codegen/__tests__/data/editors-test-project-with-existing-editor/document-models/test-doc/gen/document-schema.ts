import {
  BaseDocumentHeaderSchema,
  BaseDocumentStateSchema,
} from "document-model";
import { z } from "zod";
import { testDocDocumentType } from "./document-type.js";
import { TestDocStateSchema } from "./schema/zod.js";
import type { TestDocDocument, TestDocPHState } from "./types.js";

/** Schema for validating the header object of a TestDoc document */
export const TestDocDocumentHeaderSchema = BaseDocumentHeaderSchema.extend({
  documentType: z.literal(testDocDocumentType),
});

/** Schema for validating the state object of a TestDoc document */
export const TestDocPHStateSchema = BaseDocumentStateSchema.extend({
  global: TestDocStateSchema(),
});

export const TestDocDocumentSchema = z.object({
  header: TestDocDocumentHeaderSchema,
  state: TestDocPHStateSchema,
  initialState: TestDocPHStateSchema,
});

/** Simple helper function to check if a state object is a TestDoc document state object */
export function isTestDocState(state: unknown): state is TestDocPHState {
  return TestDocPHStateSchema.safeParse(state).success;
}

/** Simple helper function to assert that a document state object is a TestDoc document state object */
export function assertIsTestDocState(
  state: unknown,
): asserts state is TestDocPHState {
  TestDocPHStateSchema.parse(state);
}

/** Simple helper function to check if a document is a TestDoc document */
export function isTestDocDocument(
  document: unknown,
): document is TestDocDocument {
  return TestDocDocumentSchema.safeParse(document).success;
}

/** Simple helper function to assert that a document is a TestDoc document */
export function assertIsTestDocDocument(
  document: unknown,
): asserts document is TestDocDocument {
  TestDocDocumentSchema.parse(document);
}
