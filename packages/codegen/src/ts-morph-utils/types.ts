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

export type EditorFilePaths = {
  editorSourceFilesPath: string;
  editorsDirPath: string;
  editorFilePath: string;
  editorModuleFilePath: string;
  editDocumentNameComponentFilePath: string;
};

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
