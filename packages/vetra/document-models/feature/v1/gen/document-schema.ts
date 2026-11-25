/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import {
  BaseDocumentHeaderSchema,
  BaseDocumentStateSchema,
} from "document-model";
import { z } from "zod";
import { featureDocumentType } from "./document-type.js";
import { FeatureStateSchema } from "./schema/zod.js";
import type { FeatureDocument, FeaturePHState } from "./types.js";

/** Schema for validating the header object of a Feature document */
export const FeatureDocumentHeaderSchema = BaseDocumentHeaderSchema.extend({
  documentType: z.literal(featureDocumentType),
});

/** Schema for validating the state object of a Feature document */
export const FeaturePHStateSchema = BaseDocumentStateSchema.extend({
  global: FeatureStateSchema(),
});

export const FeatureDocumentSchema = z.object({
  header: FeatureDocumentHeaderSchema,
  state: FeaturePHStateSchema,
  initialState: FeaturePHStateSchema,
});

/** Simple helper function to check if a state object is a Feature document state object */
export function isFeatureState(state: unknown): state is FeaturePHState {
  return FeaturePHStateSchema.safeParse(state).success;
}

/** Simple helper function to assert that a document state object is a Feature document state object */
export function assertIsFeatureState(
  state: unknown,
): asserts state is FeaturePHState {
  FeaturePHStateSchema.parse(state);
}

/** Simple helper function to check if a document is a Feature document */
export function isFeatureDocument(
  document: unknown,
): document is FeatureDocument {
  return FeatureDocumentSchema.safeParse(document).success;
}

/** Simple helper function to assert that a document is a Feature document */
export function assertIsFeatureDocument(
  document: unknown,
): asserts document is FeatureDocument {
  FeatureDocumentSchema.parse(document);
}
