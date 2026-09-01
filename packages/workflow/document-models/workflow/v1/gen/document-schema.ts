/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import {
  BaseDocumentHeaderSchema,
  BaseDocumentStateSchema,
} from "document-model";
import { z } from "zod";
import { workflowDocumentType } from "./document-type.js";
import { WorkflowStateSchema } from "./schema/zod.js";
import type { WorkflowDocument, WorkflowPHState } from "./types.js";

/** Schema for validating the header object of a Workflow document */
export const WorkflowDocumentHeaderSchema = BaseDocumentHeaderSchema.extend({
  documentType: z.literal(workflowDocumentType),
});

/** Schema for validating the state object of a Workflow document */
export const WorkflowPHStateSchema = BaseDocumentStateSchema.extend({
  global: WorkflowStateSchema(),
});

export const WorkflowDocumentSchema = z.object({
  header: WorkflowDocumentHeaderSchema,
  state: WorkflowPHStateSchema,
  initialState: WorkflowPHStateSchema,
});

/** Simple helper function to check if a state object is a Workflow document state object */
export function isWorkflowState(state: unknown): state is WorkflowPHState {
  return WorkflowPHStateSchema.safeParse(state).success;
}

/** Simple helper function to assert that a document state object is a Workflow document state object */
export function assertIsWorkflowState(
  state: unknown,
): asserts state is WorkflowPHState {
  WorkflowPHStateSchema.parse(state);
}

/** Simple helper function to check if a document is a Workflow document */
export function isWorkflowDocument(
  document: unknown,
): document is WorkflowDocument {
  return WorkflowDocumentSchema.safeParse(document).success;
}

/** Simple helper function to assert that a document is a Workflow document */
export function assertIsWorkflowDocument(
  document: unknown,
): asserts document is WorkflowDocument {
  WorkflowDocumentSchema.parse(document);
}
