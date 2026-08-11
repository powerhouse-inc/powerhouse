/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import {
  BaseDocumentHeaderSchema,
  BaseDocumentStateSchema,
} from "document-model";
import { z } from "zod";
import { reactorGroupDocumentType } from "./document-type.js";
import { ReactorGroupStateSchema } from "./schema/zod.js";
import type { ReactorGroupDocument, ReactorGroupPHState } from "./types.js";

/** Schema for validating the header object of a ReactorGroup document */
export const ReactorGroupDocumentHeaderSchema = BaseDocumentHeaderSchema.extend(
  {
    documentType: z.literal(reactorGroupDocumentType),
  },
);

/** Schema for validating the state object of a ReactorGroup document */
export const ReactorGroupPHStateSchema = BaseDocumentStateSchema.extend({
  global: ReactorGroupStateSchema(),
});

export const ReactorGroupDocumentSchema = z.object({
  header: ReactorGroupDocumentHeaderSchema,
  state: ReactorGroupPHStateSchema,
  initialState: ReactorGroupPHStateSchema,
});

/** Simple helper function to check if a state object is a ReactorGroup document state object */
export function isReactorGroupState(
  state: unknown,
): state is ReactorGroupPHState {
  return ReactorGroupPHStateSchema.safeParse(state).success;
}

/** Simple helper function to assert that a document state object is a ReactorGroup document state object */
export function assertIsReactorGroupState(
  state: unknown,
): asserts state is ReactorGroupPHState {
  ReactorGroupPHStateSchema.parse(state);
}

/** Simple helper function to check if a document is a ReactorGroup document */
export function isReactorGroupDocument(
  document: unknown,
): document is ReactorGroupDocument {
  return ReactorGroupDocumentSchema.safeParse(document).success;
}

/** Simple helper function to assert that a document is a ReactorGroup document */
export function assertIsReactorGroupDocument(
  document: unknown,
): asserts document is ReactorGroupDocument {
  ReactorGroupDocumentSchema.parse(document);
}
