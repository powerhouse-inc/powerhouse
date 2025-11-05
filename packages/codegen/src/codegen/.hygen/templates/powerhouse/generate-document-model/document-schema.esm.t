---
to: "<%= rootDir %>/<%= paramCaseDocumentType %>/gen/document-schema.ts"
force: true
---
import {
  BaseDocumentHeaderSchema,
  BaseDocumentStateSchema,
  type PHDocument,
} from "document-model";
import { z } from "zod";
import { <%= documentTypeVariableName %> } from "./document-type.js";
import { <%= stateSchemaName %> } from "./schema/zod.js";
import type { <%= phDocumentTypeName %> } from "./types.js";

export const <%= phDocumentTypeName %>HeaderSchema = BaseDocumentHeaderSchema.extend({
  documentType: z.literal(<%= documentTypeVariableName %>),
});

export const <%= phDocumentTypeName %>StateSchema = BaseDocumentStateSchema.extend({
  global: <%= stateSchemaName %>(),
});

export const <%= phDocumentSchemaName %> = z.object({
  header: <%= phDocumentTypeName %>HeaderSchema,
  state: <%= phDocumentTypeName %>StateSchema,
  initialState: <%= phDocumentTypeName %>StateSchema,
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
