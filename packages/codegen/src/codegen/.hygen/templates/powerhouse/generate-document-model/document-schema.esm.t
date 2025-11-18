---
to: "<%= rootDir %>/<%= paramCaseDocumentType %>/gen/document-schema.ts"
force: true
---
import {
  BaseDocumentHeaderSchema,
  BaseDocumentStateSchema,
} from "document-model";
import { z } from "zod";
import { <%= documentTypeVariableName %> } from "./document-type.js";
import { <%= stateSchemaName %> } from "./schema/zod.js";
import type { <%= phDocumentTypeName %>, <%= phStateName %> } from "./types.js";

/** Schema for validating the header object of a <%= pascalCaseDocumentType %> document */
export const <%= phDocumentTypeName %>HeaderSchema = BaseDocumentHeaderSchema.extend({
  documentType: z.literal(<%= documentTypeVariableName %>),
});

/** Schema for validating the state object of a <%= pascalCaseDocumentType %> document */
export const <%= phStateName %>Schema = BaseDocumentStateSchema.extend({
  global: <%= stateSchemaName %>(),
});

export const <%= phDocumentSchemaName %> = z.object({
  header: <%= phDocumentTypeName %>HeaderSchema,
  state: <%= phStateName %>Schema,
  initialState: <%= phStateName %>Schema,
});

/** Simple helper function to check if a state object is a <%= pascalCaseDocumentType %> document state object */
export function <%= isPhStateOfTypeFunctionName %>(
  state: unknown,
): state is <%= phStateName %> {
  return <%= phStateName %>Schema.safeParse(state).success;
}

/** Simple helper function to assert that a document state object is a <%= pascalCaseDocumentType %> document state object */
export function <%= assertIsPhStateOfTypeFunctionName %>(
  state: unknown,
): asserts state is <%= phStateName %> {
  <%= phStateName %>Schema.parse(state);
}

/** Simple helper function to check if a document is a <%= pascalCaseDocumentType %> document */
export function <%= isPhDocumentOfTypeFunctionName %>(
  document: unknown,
): document is <%= phDocumentTypeName %> {
  return <%= phDocumentSchemaName %>.safeParse(document).success;
}

/** Simple helper function to assert that a document is a <%= pascalCaseDocumentType %> document */
export function <%= assertIsPhDocumentOfTypeFunctionName %>(
  document: unknown,
): asserts document is <%= phDocumentTypeName %> {
  <%= phDocumentSchemaName %>.parse(document);
}
