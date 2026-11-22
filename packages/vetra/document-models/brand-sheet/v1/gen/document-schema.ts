/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import {
  BaseDocumentHeaderSchema,
  BaseDocumentStateSchema,
} from "document-model";
import { z } from "zod";
import { brandSheetDocumentType } from "./document-type.js";
import { BrandSheetStateSchema } from "./schema/zod.js";
import type { BrandSheetDocument, BrandSheetPHState } from "./types.js";

/** Schema for validating the header object of a BrandSheet document */
export const BrandSheetDocumentHeaderSchema = BaseDocumentHeaderSchema.extend({
  documentType: z.literal(brandSheetDocumentType),
});

/** Schema for validating the state object of a BrandSheet document */
export const BrandSheetPHStateSchema = BaseDocumentStateSchema.extend({
  global: BrandSheetStateSchema(),
});

export const BrandSheetDocumentSchema = z.object({
  header: BrandSheetDocumentHeaderSchema,
  state: BrandSheetPHStateSchema,
  initialState: BrandSheetPHStateSchema,
});

/** Simple helper function to check if a state object is a BrandSheet document state object */
export function isBrandSheetState(state: unknown): state is BrandSheetPHState {
  return BrandSheetPHStateSchema.safeParse(state).success;
}

/** Simple helper function to assert that a document state object is a BrandSheet document state object */
export function assertIsBrandSheetState(
  state: unknown,
): asserts state is BrandSheetPHState {
  BrandSheetPHStateSchema.parse(state);
}

/** Simple helper function to check if a document is a BrandSheet document */
export function isBrandSheetDocument(
  document: unknown,
): document is BrandSheetDocument {
  return BrandSheetDocumentSchema.safeParse(document).success;
}

/** Simple helper function to assert that a document is a BrandSheet document */
export function assertIsBrandSheetDocument(
  document: unknown,
): asserts document is BrandSheetDocument {
  BrandSheetDocumentSchema.parse(document);
}
