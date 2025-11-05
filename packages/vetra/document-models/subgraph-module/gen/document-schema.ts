import {
  BaseDocumentHeaderSchema,
  BaseDocumentStateSchema,
} from "document-model";
import { z } from "zod";
import { subgraphModuleDocumentType } from "./document-type.js";
import { SubgraphModuleStateSchema } from "./schema/zod.js";
import type { SubgraphModuleDocument, SubgraphModulePHState } from "./types.js";

/** Schema for validating the header object of a SubgraphModule document */
export const SubgraphModuleDocumentHeaderSchema =
  BaseDocumentHeaderSchema.extend({
    documentType: z.literal(subgraphModuleDocumentType),
  });

/** Schema for validating the state object of a SubgraphModule document */
export const SubgraphModulePHStateSchema = BaseDocumentStateSchema.extend({
  global: SubgraphModuleStateSchema(),
});

export const SubgraphModuleDocumentSchema = z.object({
  header: SubgraphModuleDocumentHeaderSchema,
  state: SubgraphModulePHStateSchema,
  initialState: SubgraphModulePHStateSchema,
});

/** Simple helper function to check if a state object is a SubgraphModule document state object */
export function isSubgraphModuleState(
  state: unknown,
): state is SubgraphModulePHState {
  return SubgraphModulePHStateSchema.safeParse(state).success;
}

/** Simple helper function to assert that a document state object is a SubgraphModule document state object */
export function assertIsSubgraphModuleState(
  state: unknown,
): asserts state is SubgraphModulePHState {
  SubgraphModulePHStateSchema.parse(state);
}

/** Simple helper function to check if a document is a SubgraphModule document */
export function isSubgraphModuleDocument(
  document: unknown,
): document is SubgraphModuleDocument {
  return SubgraphModuleDocumentSchema.safeParse(document).success;
}

/** Simple helper function to assert that a document is a SubgraphModule document */
export function assertIsSubgraphModuleDocument(
  document: unknown,
): asserts document is SubgraphModuleDocument {
  SubgraphModuleDocumentSchema.parse(document);
}
