import type { PHDocument } from "document-model";
import { z } from "zod";
import { processorModuleDocumentType } from "./document-type.js";
import { ProcessorModuleStateSchema } from "./schema/zod.js";
import type { ProcessorModuleDocument } from "./types.js";

export const ProcessorModuleDocumentSchema = z.object({
  header: z.object({
    id: z.string(),
    name: z.string(),
    createdAtUtcIso: z.string(),
    lastModifiedAtUtcIso: z.string(),
    documentType: z.literal(processorModuleDocumentType),
  }),
  state: z.object({
    global: ProcessorModuleStateSchema(),
  }),
  initialState: z.object({
    global: ProcessorModuleStateSchema(),
  }),
});

/** Simple helper function to check if a document is a ProcessorModule document */
export function isProcessorModuleDocument(
  document: PHDocument | undefined,
): document is ProcessorModuleDocument {
  return ProcessorModuleDocumentSchema.safeParse(document).success;
}

/** Simple helper function to assert that a document is a ProcessorModule document */
export function assertIsProcessorModuleDocument(
  document: PHDocument | undefined,
): asserts document is ProcessorModuleDocument {
  ProcessorModuleDocumentSchema.parse(document);
}
