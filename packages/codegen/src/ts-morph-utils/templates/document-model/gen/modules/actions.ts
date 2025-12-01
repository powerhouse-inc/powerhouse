import { ts } from "@tmpl/core";
import type { ActionFromOperation } from "../../../../name-builders/types.js";
import {
  getActionInputName,
  getActionInputTypeNames,
  getActionType,
  getActionTypeName,
} from "../../../utils.js";

function getActionTypeExport(action: ActionFromOperation) {
  const baseActionTypeName = action.hasAttachment
    ? "ActionWithAttachment"
    : "Action";
  const actionTypeName = getActionTypeName(action);
  const actionInputName = getActionInputName(action) ?? `"{}"`;
  const actionType = getActionType(action);

  return ts`export type ${actionTypeName} = ${baseActionTypeName} & { type: "${actionType}"; input: ${actionInputName} };`
    .raw;
}

function getActionTypeExports(actions: ActionFromOperation[]) {
  return actions.map(getActionTypeExport).join("\n");
}

export function getModuleExportType(
  actions: ActionFromOperation[],
  pascalCaseDocumentName: string,
  pascalCaseModuleName: string,
) {
  const actionTypeNames = actions.map(getActionTypeName).join(" |\n");
  return ts`export type ${pascalCaseDocumentName}${pascalCaseModuleName}Action = ${actionTypeNames};`
    .raw;
}

function getDocumentModelActionTypeImportNames(actions: ActionFromOperation[]) {
  const actionTypeImports = ["Action"];
  const anyActionHasAttachment = actions.some((a) => a.hasAttachment);
  if (anyActionHasAttachment) {
    actionTypeImports.push("ActionWithAttachment");
  }
  return actionTypeImports.join(",\n");
}
export const documentModelOperationModuleActionsFileTemplate = (v: {
  actions: ActionFromOperation[];
  pascalCaseDocumentType: string;
  pascalCaseModuleName: string;
}) =>
  ts`
import type { ${getDocumentModelActionTypeImportNames(v.actions)} } from 'document-model';
import type {
  ${getActionInputTypeNames(v.actions)}
} from '../types.js';

${getActionTypeExports(v.actions)}

${getModuleExportType(
  v.actions,
  v.pascalCaseDocumentType,
  v.pascalCaseModuleName,
)}
`.raw;
