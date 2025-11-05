import {
  BaseDocumentHeaderSchema,
  BaseDocumentStateSchema,
} from "document-model";
import { z } from "zod";
import { processorModuleDocumentType } from "./document-type.js";
import { ProcessorModuleStateSchema } from "./schema/zod.js";
import type {
  ProcessorModuleDocument,
  ProcessorModulePHState,
} from "./types.js";

/** Schema for validating the header object of a ProcessorModule document */
export const ProcessorModuleDocumentHeaderSchema =
  BaseDocumentHeaderSchema.extend({
    documentType: z.literal(processorModuleDocumentType),
  });

/** Schema for validating the state object of a ProcessorModule document */
export const ProcessorModulePHStateSchema = BaseDocumentStateSchema.extend({
  global: ProcessorModuleStateSchema(),
});

export const ProcessorModuleDocumentSchema = z.object({
  header: ProcessorModuleDocumentHeaderSchema,
  state: ProcessorModulePHStateSchema,
  initialState: ProcessorModulePHStateSchema,
});

/** Simple helper function to check if a state object is a ProcessorModule document state object */
export function isProcessorModuleState(
  state: unknown,
): state is ProcessorModulePHState {
  return ProcessorModulePHStateSchema.safeParse(state).success;
}

/** Simple helper function to assert that a document state object is a ProcessorModule document state object */
export function assertIsProcessorModuleState(
  state: unknown,
): asserts state is ProcessorModulePHState {
  ProcessorModulePHStateSchema.parse(state);
}

/** Simple helper function to check if a document is a ProcessorModule document */
export function isProcessorModuleDocument(
  document: unknown,
): document is ProcessorModuleDocument {
  return ProcessorModuleDocumentSchema.safeParse(document).success;
}

/** Simple helper function to assert that a document is a ProcessorModule document */
export function assertIsProcessorModuleDocument(
  document: unknown,
): asserts document is ProcessorModuleDocument {
  ProcessorModuleDocumentSchema.parse(document);
}
