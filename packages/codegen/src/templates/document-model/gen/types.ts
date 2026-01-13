import type { DocumentModelTemplateInputs } from "@powerhousedao/codegen/file-builders";
import { ts } from "@tmpl/core";

function buildEmptyLocalStateType(
  hasLocalSchema: boolean,
  localStateName: string,
) {
  if (hasLocalSchema) return "";

  return `type ${localStateName} = Record<PropertyKey, never>;`;
}

function buildLocalStateTypeImport(
  hasLocalSchema: boolean,
  localStateName: string,
) {
  if (!hasLocalSchema) return "";
  return localStateName;
}
export const documentModelGenTypesTemplate = (v: DocumentModelTemplateInputs) =>
  ts`
import type { PHDocument, PHBaseState } from 'document-model';
import type { ${v.actionTypeName} } from './actions.js';
import type {
  ${v.stateName} as ${v.globalStateName},
  ${buildLocalStateTypeImport(v.hasLocalSchema, v.localStateName)}
} from './schema/types.js';

${buildEmptyLocalStateType(v.hasLocalSchema, v.localStateName)}

type ${v.phStateName} = PHBaseState & {
  global: ${v.globalStateName};
  local: ${v.localStateName};
};
type ${v.phDocumentTypeName} = PHDocument<${v.phStateName}>;

export * from './schema/types.js';

export type { 
  ${v.globalStateName}, 
  ${v.localStateName},
  ${v.phStateName}, 
  ${v.actionTypeName},
  ${v.phDocumentTypeName},
};
`.raw;
