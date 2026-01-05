import type { DocumentModelTemplateInputs } from "@powerhousedao/codegen/ts-morph";
import { ts } from "@tmpl/core";

export const documentModelDocumentSchemaFileTemplate = (
  v: DocumentModelTemplateInputs,
) =>
  ts`
import {
  BaseDocumentHeaderSchema,
  BaseDocumentStateSchema,
} from "document-model";
import { z } from "zod";
import { ${v.documentTypeVariableName} } from "./document-type.js";
import { ${v.stateSchemaName} } from "./schema/zod.js";
import type { ${v.phDocumentTypeName}, ${v.phStateName} } from "@powerhousedao/codegen/ts-morph";

/** Schema for validating the header object of a ${v.pascalCaseDocumentType} document */
export const ${v.phDocumentTypeName}HeaderSchema = BaseDocumentHeaderSchema.extend({
  documentType: z.literal(${v.documentTypeVariableName}),
});

/** Schema for validating the state object of a ${v.pascalCaseDocumentType} document */
export const ${v.phStateName}Schema = BaseDocumentStateSchema.extend({
  global: ${v.stateSchemaName}(),
});

export const ${v.phDocumentSchemaName} = z.object({
  header: ${v.phDocumentTypeName}HeaderSchema,
  state: ${v.phStateName}Schema,
  initialState: ${v.phStateName}Schema,
});

/** Simple helper function to check if a state object is a ${v.pascalCaseDocumentType} document state object */
export function ${v.isPhStateOfTypeFunctionName}(
  state: unknown,
): state is ${v.phStateName} {
  return ${v.phStateName}Schema.safeParse(state).success;
}

/** Simple helper function to assert that a document state object is a ${v.pascalCaseDocumentType} document state object */
export function ${v.assertIsPhStateOfTypeFunctionName}(
  state: unknown,
): asserts state is ${v.phStateName} {
  ${v.phStateName}Schema.parse(state);
}

/** Simple helper function to check if a document is a ${v.pascalCaseDocumentType} document */
export function ${v.isPhDocumentOfTypeFunctionName}(
  document: unknown,
): document is ${v.phDocumentTypeName} {
  return ${v.phDocumentSchemaName}.safeParse(document).success;
}

/** Simple helper function to assert that a document is a ${v.pascalCaseDocumentType} document */
export function ${v.assertIsPhDocumentOfTypeFunctionName}(
  document: unknown,
): asserts document is ${v.phDocumentTypeName} {
  ${v.phDocumentSchemaName}.parse(document);
}
`.raw;
