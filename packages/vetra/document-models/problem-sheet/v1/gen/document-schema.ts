/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import {
  BaseDocumentHeaderSchema,
  BaseDocumentStateSchema,
} from "document-model";
import { z } from "zod";
import { problemSheetDocumentType } from "./document-type.js";
import { ProblemSheetStateSchema } from "./schema/zod.js";
import type { ProblemSheetDocument, ProblemSheetPHState } from "./types.js";

/** Schema for validating the header object of a ProblemSheet document */
export const ProblemSheetDocumentHeaderSchema = BaseDocumentHeaderSchema.extend(
  {
    documentType: z.literal(problemSheetDocumentType),
  },
);

/** Schema for validating the state object of a ProblemSheet document */
export const ProblemSheetPHStateSchema = BaseDocumentStateSchema.extend({
  global: ProblemSheetStateSchema(),
});

export const ProblemSheetDocumentSchema = z.object({
  header: ProblemSheetDocumentHeaderSchema,
  state: ProblemSheetPHStateSchema,
  initialState: ProblemSheetPHStateSchema,
});

/** Simple helper function to check if a state object is a ProblemSheet document state object */
export function isProblemSheetState(
  state: unknown,
): state is ProblemSheetPHState {
  return ProblemSheetPHStateSchema.safeParse(state).success;
}

/** Simple helper function to assert that a document state object is a ProblemSheet document state object */
export function assertIsProblemSheetState(
  state: unknown,
): asserts state is ProblemSheetPHState {
  ProblemSheetPHStateSchema.parse(state);
}

/** Simple helper function to check if a document is a ProblemSheet document */
export function isProblemSheetDocument(
  document: unknown,
): document is ProblemSheetDocument {
  return ProblemSheetDocumentSchema.safeParse(document).success;
}

/** Simple helper function to assert that a document is a ProblemSheet document */
export function assertIsProblemSheetDocument(
  document: unknown,
): asserts document is ProblemSheetDocument {
  ProblemSheetDocumentSchema.parse(document);
}
