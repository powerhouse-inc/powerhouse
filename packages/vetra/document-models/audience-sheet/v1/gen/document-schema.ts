/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import {
  BaseDocumentHeaderSchema,
  BaseDocumentStateSchema,
} from "document-model";
import { z } from "zod";
import { audienceSheetDocumentType } from "./document-type.js";
import { AudienceSheetStateSchema } from "./schema/zod.js";
import type { AudienceSheetDocument, AudienceSheetPHState } from "./types.js";

/** Schema for validating the header object of a AudienceSheet document */
export const AudienceSheetDocumentHeaderSchema =
  BaseDocumentHeaderSchema.extend({
    documentType: z.literal(audienceSheetDocumentType),
  });

/** Schema for validating the state object of a AudienceSheet document */
export const AudienceSheetPHStateSchema = BaseDocumentStateSchema.extend({
  global: AudienceSheetStateSchema(),
});

export const AudienceSheetDocumentSchema = z.object({
  header: AudienceSheetDocumentHeaderSchema,
  state: AudienceSheetPHStateSchema,
  initialState: AudienceSheetPHStateSchema,
});

/** Simple helper function to check if a state object is a AudienceSheet document state object */
export function isAudienceSheetState(
  state: unknown,
): state is AudienceSheetPHState {
  return AudienceSheetPHStateSchema.safeParse(state).success;
}

/** Simple helper function to assert that a document state object is a AudienceSheet document state object */
export function assertIsAudienceSheetState(
  state: unknown,
): asserts state is AudienceSheetPHState {
  AudienceSheetPHStateSchema.parse(state);
}

/** Simple helper function to check if a document is a AudienceSheet document */
export function isAudienceSheetDocument(
  document: unknown,
): document is AudienceSheetDocument {
  return AudienceSheetDocumentSchema.safeParse(document).success;
}

/** Simple helper function to assert that a document is a AudienceSheet document */
export function assertIsAudienceSheetDocument(
  document: unknown,
): asserts document is AudienceSheetDocument {
  AudienceSheetDocumentSchema.parse(document);
}
