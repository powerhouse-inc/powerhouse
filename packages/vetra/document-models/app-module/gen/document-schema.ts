import {
  BaseDocumentHeaderSchema,
  BaseDocumentStateSchema,
  type PHDocument,
} from "document-model";
import { z } from "zod";
import { appModuleDocumentType } from "./document-type.js";
import { AppModuleStateSchema } from "./schema/zod.js";
import type { AppModuleDocument } from "./types.js";

export const AppModuleDocumentHeaderSchema = BaseDocumentHeaderSchema.extend({
  documentType: z.literal(appModuleDocumentType),
});

export const AppModuleDocumentStateSchema = BaseDocumentStateSchema.extend({
  global: AppModuleStateSchema(),
});

export const AppModuleDocumentSchema = z.object({
  header: AppModuleDocumentHeaderSchema,
  state: AppModuleDocumentStateSchema,
  initialState: AppModuleDocumentStateSchema,
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
