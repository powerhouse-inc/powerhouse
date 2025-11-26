import { ts } from "@tmpl/core";
import type { DocumentModelVariableNames } from "../../../name-builders/types.js";

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
export const documentModelGenTypesTemplate = ({
  actionTypeName,
  stateName,
  globalStateName,
  hasLocalSchema,
  localStateName,
  phStateName,
  phDocumentTypeName,
}: DocumentModelVariableNames) =>
  ts`
import type { PHDocument, PHBaseState } from 'document-model';
import type { ${actionTypeName} } from './actions.js';
import type {
  ${stateName} as ${globalStateName},
  ${buildLocalStateTypeImport(hasLocalSchema, localStateName)}
} from './schema/types.js';

${buildEmptyLocalStateType(hasLocalSchema, localStateName)}

type ${phStateName} = PHBaseState & {
  global: ${globalStateName};
  local: ${localStateName};
};
type ${phDocumentTypeName} = PHDocument<${phStateName}>;

export * from './schema/types.js';

export type { 
  ${globalStateName}, 
  ${localStateName},
  ${phStateName}, 
  ${actionTypeName},
  ${phDocumentTypeName},
};
`.raw;
