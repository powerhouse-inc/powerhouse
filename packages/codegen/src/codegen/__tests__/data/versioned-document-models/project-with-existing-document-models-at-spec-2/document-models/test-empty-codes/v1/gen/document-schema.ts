import {
  BaseDocumentHeaderSchema,
  BaseDocumentStateSchema,
} from "document-model";
import { z } from "zod";
import { testEmptyCodesDocumentType } from "./document-type.js";
import { TestEmptyCodesStateSchema } from "./schema/zod.js";
import type { TestEmptyCodesDocument, TestEmptyCodesPHState } from "./types.js";

/** Schema for validating the header object of a TestEmptyCodes document */
export const TestEmptyCodesDocumentHeaderSchema =
  BaseDocumentHeaderSchema.extend({
    documentType: z.literal(testEmptyCodesDocumentType),
  });

/** Schema for validating the state object of a TestEmptyCodes document */
export const TestEmptyCodesPHStateSchema = BaseDocumentStateSchema.extend({
  global: TestEmptyCodesStateSchema(),
});

export const TestEmptyCodesDocumentSchema = z.object({
  header: TestEmptyCodesDocumentHeaderSchema,
  state: TestEmptyCodesPHStateSchema,
  initialState: TestEmptyCodesPHStateSchema,
});

/** Simple helper function to check if a state object is a TestEmptyCodes document state object */
export function isTestEmptyCodesState(
  state: unknown,
): state is TestEmptyCodesPHState {
  return TestEmptyCodesPHStateSchema.safeParse(state).success;
}

/** Simple helper function to assert that a document state object is a TestEmptyCodes document state object */
export function assertIsTestEmptyCodesState(
  state: unknown,
): asserts state is TestEmptyCodesPHState {
  TestEmptyCodesPHStateSchema.parse(state);
}

/** Simple helper function to check if a document is a TestEmptyCodes document */
export function isTestEmptyCodesDocument(
  document: unknown,
): document is TestEmptyCodesDocument {
  return TestEmptyCodesDocumentSchema.safeParse(document).success;
}

/** Simple helper function to assert that a document is a TestEmptyCodes document */
export function assertIsTestEmptyCodesDocument(
  document: unknown,
): asserts document is TestEmptyCodesDocument {
  TestEmptyCodesDocumentSchema.parse(document);
}
