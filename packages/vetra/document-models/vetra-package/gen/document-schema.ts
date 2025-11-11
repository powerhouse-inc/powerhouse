import {
  BaseDocumentHeaderSchema,
  BaseDocumentStateSchema,
} from "document-model";
import { z } from "zod";
import { vetraPackageDocumentType } from "./document-type.js";
import { VetraPackageStateSchema } from "./schema/zod.js";
import type { VetraPackageDocument, VetraPackagePHState } from "./types.js";

/** Schema for validating the header object of a VetraPackage document */
export const VetraPackageDocumentHeaderSchema = BaseDocumentHeaderSchema.extend(
  {
    documentType: z.literal(vetraPackageDocumentType),
  },
);

/** Schema for validating the state object of a VetraPackage document */
export const VetraPackagePHStateSchema = BaseDocumentStateSchema.extend({
  global: VetraPackageStateSchema(),
});

export const VetraPackageDocumentSchema = z.object({
  header: VetraPackageDocumentHeaderSchema,
  state: VetraPackagePHStateSchema,
  initialState: VetraPackagePHStateSchema,
});

/** Simple helper function to check if a state object is a VetraPackage document state object */
export function isVetraPackageState(
  state: unknown,
): state is VetraPackagePHState {
  return VetraPackagePHStateSchema.safeParse(state).success;
}

/** Simple helper function to assert that a document state object is a VetraPackage document state object */
export function assertIsVetraPackageState(
  state: unknown,
): asserts state is VetraPackagePHState {
  VetraPackagePHStateSchema.parse(state);
}

/** Simple helper function to check if a document is a VetraPackage document */
export function isVetraPackageDocument(
  document: unknown,
): document is VetraPackageDocument {
  return VetraPackageDocumentSchema.safeParse(document).success;
}

/** Simple helper function to assert that a document is a VetraPackage document */
export function assertIsVetraPackageDocument(
  document: unknown,
): asserts document is VetraPackageDocument {
  VetraPackageDocumentSchema.parse(document);
}
