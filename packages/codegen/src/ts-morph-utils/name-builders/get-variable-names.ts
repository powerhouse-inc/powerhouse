import { camelCase, paramCase, pascalCase } from "change-case";
import type { DocumentModelGlobalState } from "document-model";
import path from "node:path";
import { getInitialStates } from "../templates/utils.js";
import type {
  DocumentModelDocumentTypeMetadata,
  EditorVariableNames,
} from "../types.js";
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

type GetDocumentModelVariableNamesArgs = {
  packageName: string;
  projectDir: string;
  documentModelState: DocumentModelGlobalState;
};
export function getDocumentModelVariableNames({
  packageName,
  projectDir,
  documentModelState,
}: GetDocumentModelVariableNamesArgs) {
  const documentType = documentModelState.name;
  const documentTypeId = documentModelState.id;
  const latestSpec =
    documentModelState.specifications[
      documentModelState.specifications.length - 1
    ];
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
  const documentModelDir = `${packageName}/document-models/${paramCaseDocumentType}`;
  const documentModelDirPath = path.join(
    projectDir,
    "document-models",
    paramCaseDocumentType,
  );
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
  const fileExtension = documentModelState.extension;
  const { initialGlobalState, initialLocalState } = getInitialStates(
    latestSpec.state,
  );
  return {
    documentTypeId,
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
    documentModelDir,
    documentModelDirPath,
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
    fileExtension,
    initialGlobalState,
    initialLocalState,
  };
}
