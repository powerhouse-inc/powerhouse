---
to: "<%= rootDir %>/<%= paramCaseDocumentType %>/gen/document-schema.ts"
force: true
---
import type { PHDocument } from "document-model";
import { z } from "zod";
import { <%= documentTypeVariableName %> } from "./document-type.js";
import { <%= stateSchemaName %> } from "./schema/zod.js";
import type { <%= phDocumentTypeName %> } from "./types.js";

export const <%= phDocumentSchemaName %> = z.object({
  header: z.object({
    id: z.string(),
    name: z.string(),
    createdAtUtcIso: z.string(),
    lastModifiedAtUtcIso: z.string(),
    documentType: z.literal(<%= documentTypeVariableName %>),
  }),
  state: z.object({
    global: <%= stateName %>Schema(),
  }),
  initialState: z.object({
    global: <%= stateName %>Schema(),
  }),
});

/** Simple helper function to check if a document is a <%= pascalCaseDocumentType %> document */
export function <%= isPhDocumentOfTypeFunctionName %>(
  document: PHDocument | undefined,
): document is <%= phDocumentTypeName %> {
  return <%= phDocumentSchemaName %>.safeParse(document).success;
}

/** Simple helper function to assert that a document is a <%= pascalCaseDocumentType %> document */
export function <%= assertIsPhDocumentOfTypeFunctionName %>(
  document: PHDocument | undefined,
): asserts document is <%= phDocumentTypeName %> {
  <%= phDocumentSchemaName %>.parse(document);
}
