import type { getEditorFilePaths } from "./name-builders/get-file-paths.js";

export type DocumentModelDocumentTypeMetadata = {
  documentModelId: string;
  documentModelDocumentTypeName: string;
  documentModelDirName: string;
  documentModelImportPath: string;
};

export type DocumentModelFilePaths = {
  documentModelsSourceFilesPath: string;
  documentModelsDirPath: string;
};

export type EditorFilePaths = ReturnType<typeof getEditorFilePaths>;

export type EditorVariableNames = {
  documentVariableName: string;
  editDocumentNameComponentName: string;
  useSelectedDocumentHookName: string;
  documentNameVariableName: string;
  dispatchFunctionName: string;
  onClickEditHandlerName: string;
  onCancelEditHandlerName: string;
  setNameActionName: string;
  isEditingVariableName: string;
  setIsEditingFunctionName: string;
  onSubmitSetNameFunctionName: string;
};
