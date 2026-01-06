import type {
  ActionFromOperation,
  DocumentModelTemplateInputsWithModule,
} from "@powerhousedao/codegen/ts-morph";
import { ts } from "@tmpl/core";
import { camelCase, pascalCase } from "change-case";
import type { ModuleSpecification } from "document-model";
import { getActionTypeName } from "../../../utils.js";

function getActionTypeNames(actions: ActionFromOperation[]) {
  return actions.map(getActionTypeName);
}

function getActionTypeImports(actions: ActionFromOperation[]) {
  const actionTypeNames = getActionTypeNames(actions);
  return actionTypeNames.join(",\n");
}

function getOperationsInterfaceName(
  pascalCaseDocumentType: string,
  module: ModuleSpecification,
) {
  const pascalCaseModuleName = pascalCase(module.name);
  return `${pascalCaseDocumentType}${pascalCaseModuleName}Operations`;
}

function getActionOperationFieldName(action: ActionFromOperation) {
  const camelCaseActionName = camelCase(action.name);
  return `${camelCaseActionName}Operation`;
}

function getActionOperationStateTypeName(
  action: ActionFromOperation,
  pascalCaseDocumentType: string,
) {
  if (!action.state) return `${pascalCaseDocumentType}State`;
  const pascalCaseStateName = pascalCase(action.state);
  return `${pascalCaseDocumentType}_${pascalCaseStateName}_State`;
}

function getActionOperationStateTypeImports(
  actions: ActionFromOperation[],
  pascalCaseDocumentType: string,
) {
  const stateTypeNames = actions.map((action) =>
    getActionOperationStateTypeName(action, pascalCaseDocumentType),
  );

  return Array.from(new Set(stateTypeNames)).join(",\n");
}

function getActionOperationFunction(
  action: ActionFromOperation,
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
  action: ActionFromOperation,
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

function getOperationsInterfaceFields(
  actions: ActionFromOperation[],
  pascalCaseDocumentType: string,
) {
  return actions
    .map((action) =>
      getOperationsInterfaceField(action, pascalCaseDocumentType),
    )
    .join(",");
}

export const documentModelOperationsModuleOperationsFileTemplate = (
  v: DocumentModelTemplateInputsWithModule,
) =>
  ts`
import { type SignalDispatch } from 'document-model';
import type {
  ${getActionTypeImports(v.actions)}
} from './actions.js';
import type {
  ${getActionOperationStateTypeImports(v.actions, v.pascalCaseDocumentType)}
} from "../types.js";

export interface ${getOperationsInterfaceName(
    v.pascalCaseDocumentType,
    v.module,
  )} {
    ${getOperationsInterfaceFields(v.actions, v.pascalCaseDocumentType)}
  }
`.raw;
