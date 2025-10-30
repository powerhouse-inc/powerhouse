import type { PHDocument } from "document-model";
import { z } from "zod";
import { appModuleDocumentType } from "./document-type.js";
import { AppModuleStateSchema } from "./schema/zod.js";
import type { AppModuleDocument } from "./types.js";

export const AppModuleDocumentSchema = z.object({
  header: z.object({
    id: z.string(),
    name: z.string(),
    createdAtUtcIso: z.string(),
    lastModifiedAtUtcIso: z.string(),
    documentType: z.literal(appModuleDocumentType),
  }),
  state: z.object({
    global: AppModuleStateSchema(),
  }),
  initialState: z.object({
    global: AppModuleStateSchema(),
  }),
});

/** Simple helper function to check if a document is a AppModule document */
export function isAppModuleDocument(
  document: PHDocument | undefined,
): document is AppModuleDocument {
  return AppModuleDocumentSchema.safeParse(document).success;
}

/** Simple helper function to assert that a document is a AppModule document */
export function assertIsAppModuleDocument(
  document: PHDocument | undefined,
): asserts document is AppModuleDocument {
  AppModuleDocumentSchema.parse(document);
}
