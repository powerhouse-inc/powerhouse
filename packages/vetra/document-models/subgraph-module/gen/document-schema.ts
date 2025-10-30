import type { PHDocument } from "document-model";
import { z } from "zod";
import { subgraphModuleDocumentType } from "./document-type.js";
import { SubgraphModuleStateSchema } from "./schema/zod.js";
import type { SubgraphModuleDocument } from "./types.js";

export const SubgraphModuleDocumentSchema = z.object({
  header: z.object({
    id: z.string(),
    name: z.string(),
    createdAtUtcIso: z.string(),
    lastModifiedAtUtcIso: z.string(),
    documentType: z.literal(subgraphModuleDocumentType),
  }),
  state: z.object({
    global: SubgraphModuleStateSchema(),
  }),
  initialState: z.object({
    global: SubgraphModuleStateSchema(),
  }),
});

/** Simple helper function to check if a document is a SubgraphModule document */
export function isSubgraphModuleDocument(
  document: PHDocument | undefined,
): document is SubgraphModuleDocument {
  return SubgraphModuleDocumentSchema.safeParse(document).success;
}

/** Simple helper function to assert that a document is a SubgraphModule document */
export function assertIsSubgraphModuleDocument(
  document: PHDocument | undefined,
): asserts document is SubgraphModuleDocument {
  SubgraphModuleDocumentSchema.parse(document);
}
