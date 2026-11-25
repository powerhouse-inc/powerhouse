/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import {
  BaseDocumentHeaderSchema,
  BaseDocumentStateSchema,
} from "document-model";
import { z } from "zod";
import { workBreakdownStructureDocumentType } from "./document-type.js";
import { WorkBreakdownStructureStateSchema } from "./schema/zod.js";
import type {
  WorkBreakdownStructureDocument,
  WorkBreakdownStructurePHState,
} from "./types.js";

/** Schema for validating the header object of a WorkBreakdownStructure document */
export const WorkBreakdownStructureDocumentHeaderSchema =
  BaseDocumentHeaderSchema.extend({
    documentType: z.literal(workBreakdownStructureDocumentType),
  });

/** Schema for validating the state object of a WorkBreakdownStructure document */
export const WorkBreakdownStructurePHStateSchema =
  BaseDocumentStateSchema.extend({
    global: WorkBreakdownStructureStateSchema(),
  });

export const WorkBreakdownStructureDocumentSchema = z.object({
  header: WorkBreakdownStructureDocumentHeaderSchema,
  state: WorkBreakdownStructurePHStateSchema,
  initialState: WorkBreakdownStructurePHStateSchema,
});

/** Simple helper function to check if a state object is a WorkBreakdownStructure document state object */
export function isWorkBreakdownStructureState(
  state: unknown,
): state is WorkBreakdownStructurePHState {
  return WorkBreakdownStructurePHStateSchema.safeParse(state).success;
}

/** Simple helper function to assert that a document state object is a WorkBreakdownStructure document state object */
export function assertIsWorkBreakdownStructureState(
  state: unknown,
): asserts state is WorkBreakdownStructurePHState {
  WorkBreakdownStructurePHStateSchema.parse(state);
}

/** Simple helper function to check if a document is a WorkBreakdownStructure document */
export function isWorkBreakdownStructureDocument(
  document: unknown,
): document is WorkBreakdownStructureDocument {
  return WorkBreakdownStructureDocumentSchema.safeParse(document).success;
}

/** Simple helper function to assert that a document is a WorkBreakdownStructure document */
export function assertIsWorkBreakdownStructureDocument(
  document: unknown,
): asserts document is WorkBreakdownStructureDocument {
  WorkBreakdownStructureDocumentSchema.parse(document);
}
