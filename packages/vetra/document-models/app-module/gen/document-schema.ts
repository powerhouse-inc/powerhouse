import {
  BaseDocumentHeaderSchema,
  BaseDocumentStateSchema,
} from "document-model";
import { z } from "zod";
import { appModuleDocumentType } from "./document-type.js";
import { AppModuleStateSchema } from "./schema/zod.js";
import type { AppModuleDocument, AppModulePHState } from "./types.js";

/** Schema for validating the header object of a AppModule document */
export const AppModuleDocumentHeaderSchema = BaseDocumentHeaderSchema.extend({
  documentType: z.literal(appModuleDocumentType),
});

/** Schema for validating the state object of a AppModule document */
export const AppModulePHStateSchema = BaseDocumentStateSchema.extend({
  global: AppModuleStateSchema(),
});

export const AppModuleDocumentSchema = z.object({
  header: AppModuleDocumentHeaderSchema,
  state: AppModulePHStateSchema,
  initialState: AppModulePHStateSchema,
});

/** Simple helper function to check if a state object is a AppModule document state object */
export function isAppModuleState(state: unknown): state is AppModulePHState {
  return AppModulePHStateSchema.safeParse(state).success;
}

/** Simple helper function to assert that a document state object is a AppModule document state object */
export function assertIsAppModuleState(
  state: unknown,
): asserts state is AppModulePHState {
  AppModulePHStateSchema.parse(state);
}

/** Simple helper function to check if a document is a AppModule document */
export function isAppModuleDocument(
  document: unknown,
): document is AppModuleDocument {
  return AppModuleDocumentSchema.safeParse(document).success;
}

/** Simple helper function to assert that a document is a AppModule document */
export function assertIsAppModuleDocument(
  document: unknown,
): asserts document is AppModuleDocument {
  AppModuleDocumentSchema.parse(document);
}
