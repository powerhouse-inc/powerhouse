import type { PHDocument } from "document-model";
import { z } from "zod";
import { vetraPackageDocumentType } from "./document-type.js";
import { VetraPackageStateSchema } from "./schema/zod.js";
import type { VetraPackageDocument } from "./types.js";

export const VetraPackageDocumentSchema = z.object({
  header: z.object({
    id: z.string(),
    name: z.string(),
    createdAtUtcIso: z.string(),
    lastModifiedAtUtcIso: z.string(),
    documentType: z.literal(vetraPackageDocumentType),
  }),
  state: z.object({
    global: VetraPackageStateSchema(),
  }),
  initialState: z.object({
    global: VetraPackageStateSchema(),
  }),
});

/** Simple helper function to check if a document is a VetraPackage document */
export function isVetraPackageDocument(
  document: PHDocument | undefined,
): document is VetraPackageDocument {
  return VetraPackageDocumentSchema.safeParse(document).success;
}

/** Simple helper function to assert that a document is a VetraPackage document */
export function assertIsVetraPackageDocument(
  document: PHDocument | undefined,
): asserts document is VetraPackageDocument {
  VetraPackageDocumentSchema.parse(document);
}
