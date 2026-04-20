import { ts } from "@tmpl/core";
import type { DocumentModelFileMakerArgs } from "file-builders";

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
export const documentModelGenTypesTemplate = (v: DocumentModelFileMakerArgs) =>
  ts`
/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
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
