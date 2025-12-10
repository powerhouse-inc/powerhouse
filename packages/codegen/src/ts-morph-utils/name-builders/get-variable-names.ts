import { camelCase, paramCase, pascalCase } from "change-case";
import {
  type DocumentModelGlobalState,
  type ModuleSpecification,
  type OperationErrorSpecification,
  type OperationSpecification,
} from "document-model";
import type {
  DocumentModelDocumentTypeMetadata,
  EditorVariableNames,
} from "../types.js";
import type { ActionFromOperation } from "./types.js";
import {
  buildDispatchFunctionName,
  buildDocumentNameVariableName,
  buildDocumentVariableName,
  buildEditDocumentNameComponentName,
  buildIsEditingVariableName,
  buildOnCancelEditHandlerName,
  buildOnClickHandlerName,
  buildOnSubmitSetNameFunctionName,
  buildSetIsEditingFunctionName,
  buildSetNameActionName,
  buildUseSelectedDocumentHookName,
} from "./variables.js";

export function getEditorVariableNames({
  documentModelDocumentTypeName,
}: DocumentModelDocumentTypeMetadata): EditorVariableNames {
  return {
    documentVariableName: buildDocumentVariableName(
      documentModelDocumentTypeName,
    ),
    editDocumentNameComponentName: buildEditDocumentNameComponentName(
      documentModelDocumentTypeName,
    ),
    useSelectedDocumentHookName: buildUseSelectedDocumentHookName(
      documentModelDocumentTypeName,
    ),
    documentNameVariableName: buildDocumentNameVariableName(
      documentModelDocumentTypeName,
    ),
    dispatchFunctionName: buildDispatchFunctionName(
      documentModelDocumentTypeName,
    ),
    onClickEditHandlerName: buildOnClickHandlerName(
      documentModelDocumentTypeName,
    ),
    onCancelEditHandlerName: buildOnCancelEditHandlerName(
      documentModelDocumentTypeName,
    ),
    setNameActionName: buildSetNameActionName(documentModelDocumentTypeName),
    isEditingVariableName: buildIsEditingVariableName(
      documentModelDocumentTypeName,
    ),
    setIsEditingFunctionName: buildSetIsEditingFunctionName(
      documentModelDocumentTypeName,
    ),
    onSubmitSetNameFunctionName: buildOnSubmitSetNameFunctionName(
      documentModelDocumentTypeName,
    ),
  };
}

export function getDocumentModelDirName(
  documentModelState: DocumentModelGlobalState,
  existingDirName?: string,
) {
  if (existingDirName) return existingDirName;
  return paramCase(documentModelState.name);
}

export function getLatestDocumentModelSpec({
  specifications,
}: DocumentModelGlobalState) {
  return specifications[specifications.length - 1];
}

export function getDocumentModelSpecByVersionNumber(
  { specifications }: DocumentModelGlobalState,
  version: number,
) {
  const specificationByIndex = specifications[version];
  const specificationByNumber = specifications.find(
    (spec) => spec.version === version,
  );
  if (!specificationByNumber) {
    console.error(
      `Specification with version number ${version} does not exist in the document model specifications array`,
    );
    return specificationByIndex;
  }
  if (specificationByIndex.version !== specificationByNumber.version) {
    console.error(
      `Specification with version ${version} does not match specifications array at index ${version}`,
    );
    return specificationByIndex;
  }

  return specificationByNumber;
}

export function getLatestDocumentModelSpecVersionNumber(
  documentModelState: DocumentModelGlobalState,
) {
  return getLatestDocumentModelSpec(documentModelState).version;
}

export function getDocumentModelVariableNames(documentType: string) {
  const paramCaseDocumentType = paramCase(documentType);
  const pascalCaseDocumentType = pascalCase(documentType);
  const camelCaseDocumentType = camelCase(documentType);
  const documentTypeVariableName = `${camelCaseDocumentType}DocumentType`;
  const stateName = `${pascalCaseDocumentType}State`;
  const globalStateName = `${pascalCaseDocumentType}GlobalState`;
  const localStateName = `${pascalCaseDocumentType}LocalState`;
  const phStateName = `${pascalCaseDocumentType}PHState`;
  const phDocumentTypeName = `${pascalCaseDocumentType}Document`;
  const actionTypeName = `${pascalCaseDocumentType}Action`;
  const actionsTypeName = `${actionTypeName}s`;
  const actionsName = camelCase(actionsTypeName);

  const stateSchemaName = `${stateName}Schema`;
  const phDocumentSchemaName = `${phDocumentTypeName}Schema`;
  const isPhStateOfTypeFunctionName = `is${stateName}`;
  const assertIsPhStateOfTypeFunctionName = `assertIs${stateName}`;
  const isPhDocumentOfTypeFunctionName = `is${phDocumentTypeName}`;
  const assertIsPhDocumentOfTypeFunctionName = `assertIs${phDocumentTypeName}`;
  const useByIdHookName = `use${phDocumentTypeName}ById`;
  const useSelectedHookName = `useSelected${phDocumentTypeName}`;
  const useInSelectedDriveHookName = `use${phDocumentTypeName}sInSelectedDrive`;
  const useInSelectedFolderHookName = `use${phDocumentTypeName}sInSelectedFolder`;

  return {
    paramCaseDocumentType,
    pascalCaseDocumentType,
    camelCaseDocumentType,
    documentTypeVariableName,
    stateName,
    globalStateName,
    localStateName,
    phStateName,
    phDocumentTypeName,
    actionTypeName,
    actionsTypeName,
    actionsName,
    stateSchemaName,
    phDocumentSchemaName,
    isPhStateOfTypeFunctionName,
    assertIsPhStateOfTypeFunctionName,
    isPhDocumentOfTypeFunctionName,
    assertIsPhDocumentOfTypeFunctionName,
    useByIdHookName,
    useSelectedHookName,
    useInSelectedDriveHookName,
    useInSelectedFolderHookName,
  };
}

export function getDocumentModelOperationsModuleVariableNames(
  module: ModuleSpecification,
) {
  const actions = getActionsFromModule(module);
  const errors = getErrorsFromActions(actions);
  return { actions, errors };
}

function getActionFromOperation(
  operation: OperationSpecification,
): ActionFromOperation {
  const { name, schema, scope = "global", errors } = operation;
  if (!name) {
    throw new Error("Operation name is required");
  }
  const hasInput = schema !== null;
  const hasAttachment = hasInput && schema.includes(": Attachment");
  const state = scope === "global" ? "" : scope;

  return {
    name,
    hasInput,
    hasAttachment,
    scope,
    state,
    errors,
  };
}

function makeNormalizedError(error: OperationErrorSpecification) {
  if (!error.name) {
    throw new Error("Error name is required");
  }
  const code = error.code || pascalCase(error.name);
  return {
    ...error,
    code,
  };
}

function getErrorsFromAction(action: ActionFromOperation) {
  const errors = action.errors;
  const errorCodeSet = new Set<string>();
  const normalizedErrors: OperationErrorSpecification[] = [];

  for (const error of errors) {
    const normalizedError = makeNormalizedError(error);
    if (!errorCodeSet.has(normalizedError.code)) {
      errorCodeSet.add(normalizedError.code);
      normalizedErrors.push(normalizedError);
    } else {
      console.warn(
        `Warning: Duplicate error code "${error.code}" with different fields found`,
      );
    }
  }

  return normalizedErrors;
}

function getErrorsFromActions(actions: ActionFromOperation[]) {
  return actions.flatMap(getErrorsFromAction);
}

function getActionsFromModule(module: ModuleSpecification) {
  return module.operations.map(getActionFromOperation);
}
