import type { DocumentModelModuleFileMakerArgs } from "@powerhousedao/codegen";
import type { OperationSpecification } from "@powerhousedao/shared";
import { ts } from "@tmpl/core";
import { pascalCase } from "change-case";
import { operationHasAttachment } from "file-builders";
import {
  getActionInputName,
  getActionInputTypeNames,
  getActionType,
  getActionTypeName,
} from "name-builders";

function getActionTypeExport(operation: OperationSpecification) {
  const baseActionTypeName = operationHasAttachment(operation)
    ? "ActionWithAttachment"
    : "Action";
  const actionTypeName = getActionTypeName(operation);
  const actionInputName = getActionInputName(operation) ?? `"{}"`;
  const actionType = getActionType(operation);

  return ts`export type ${actionTypeName} = ${baseActionTypeName} & { type: "${actionType}"; input: ${actionInputName} };`
    .raw;
}

function getActionTypeExports(args: DocumentModelModuleFileMakerArgs) {
  return args.module.operations.map(getActionTypeExport).join("\n");
}

export function getModuleExportType(args: DocumentModelModuleFileMakerArgs) {
  const { pascalCaseDocumentType, module } = args;
  const actionTypeNames = module.operations.map(getActionTypeName).join(" |\n");
  return ts`export type ${pascalCaseDocumentType}${pascalCase(module.name)}Action = ${actionTypeNames};`
    .raw;
}

function getDocumentModelActionTypeImportNames(
  args: DocumentModelModuleFileMakerArgs,
) {
  const actionTypeImports = ["Action"];
  const anyActionHasAttachment = args.module.operations.some((a) =>
    operationHasAttachment(a),
  );
  if (anyActionHasAttachment) {
    actionTypeImports.push("ActionWithAttachment");
  }
  return actionTypeImports.join(",\n");
}
export const documentModelOperationModuleActionsFileTemplate = (
  v: DocumentModelModuleFileMakerArgs,
) =>
  ts`
/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { ${getDocumentModelActionTypeImportNames(v)} } from 'document-model';
import type {
  ${getActionInputTypeNames(v)}
} from '../types.js';

${getActionTypeExports(v)}

${getModuleExportType(v)}
`.raw;
