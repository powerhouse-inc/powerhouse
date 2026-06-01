import type { DocumentModelModuleFileMakerArgs } from "@powerhousedao/codegen";
import type {
  ModuleSpecification,
  OperationSpecification,
} from "@powerhousedao/shared";
import { ts } from "@tmpl/core";
import { camelCase, pascalCase } from "change-case";
import { getActionTypeName } from "name-builders";

function getActionTypeNames(actions: OperationSpecification[]) {
  return actions.map(getActionTypeName);
}

function getActionTypeImports(args: DocumentModelModuleFileMakerArgs) {
  const actionTypeNames = getActionTypeNames(args.module.operations);
  return actionTypeNames.join(",\n");
}

function getOperationsInterfaceName(
  pascalCaseDocumentType: string,
  module: ModuleSpecification,
) {
  const pascalCaseModuleName = pascalCase(module.name);
  return `${pascalCaseDocumentType}${pascalCaseModuleName}Operations`;
}

function getActionOperationFieldName(action: OperationSpecification) {
  if (!action.name) return;
  const camelCaseActionName = camelCase(action.name);
  return `${camelCaseActionName}Operation`;
}

function getActionOperationStateTypeName(
  action: OperationSpecification,
  pascalCaseDocumentType: string,
) {
  if (!action.scope) return `${pascalCaseDocumentType}State`;
  const pascalCaseStateName = pascalCase(action.scope);
  return `${pascalCaseDocumentType}${pascalCaseStateName}State`;
}

function getActionOperationStateTypeImports(
  args: DocumentModelModuleFileMakerArgs,
) {
  const stateTypeNames = args.module.operations.map((action) =>
    getActionOperationStateTypeName(action, args.pascalCaseDocumentType),
  );

  return Array.from(new Set(stateTypeNames)).join(",\n");
}

function getActionOperationFunction(
  action: OperationSpecification,
  pascalCaseDocumentType: string,
) {
  const actionOperationStateTypeName = getActionOperationStateTypeName(
    action,
    pascalCaseDocumentType,
  );
  const actionTypeName = getActionTypeName(action);
  return ts`
  (state: ${actionOperationStateTypeName}, action: ${actionTypeName}, dispatch?: SignalDispatch) => void
`.raw;
}

function getOperationsInterfaceField(
  action: OperationSpecification,
  pascalCaseDocumentType: string,
) {
  const actionOperationFieldName = getActionOperationFieldName(action);
  const actionOperationFunction = getActionOperationFunction(
    action,
    pascalCaseDocumentType,
  );
  return ts`
    ${actionOperationFieldName}: ${actionOperationFunction}
  `.raw;
}

function getOperationsInterfaceFields(args: DocumentModelModuleFileMakerArgs) {
  return args.module.operations
    .map((action) =>
      getOperationsInterfaceField(action, args.pascalCaseDocumentType),
    )
    .join(",");
}

export const documentModelOperationsModuleOperationsFileTemplate = (
  v: DocumentModelModuleFileMakerArgs,
) =>
  ts`
/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from 'document-model';
import type {
  ${getActionTypeImports(v)}
} from './actions.js';
import type {
  ${getActionOperationStateTypeImports(v)}
} from "../types.js";

export interface ${getOperationsInterfaceName(
    v.pascalCaseDocumentType,
    v.module,
  )} {
    ${getOperationsInterfaceFields(v)}
  }
`.raw;
