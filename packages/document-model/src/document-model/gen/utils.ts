import type {
  CreateDocument,
  CreateState,
  DocumentModelDocument,
  LoadFromFile,
  LoadFromInput,
  SaveToFile,
  SaveToFileHandle,
} from "document-model";
import {
  baseCreateDocument,
  baseLoadFromFile,
  baseLoadFromInput,
  baseSaveToFile,
  baseSaveToFileHandle,
  defaultBaseState,
  documentModelFileExtension,
  documentModelReducer,
  documentModelState,
  documentType,
  initialLocalState,
} from "document-model";

export const documentModelCreateState: CreateState<DocumentModelDocument> = (
  state,
) => {
  return {
    ...defaultBaseState(),
    global: { ...documentModelState, ...(state?.global ?? {}) },
    local: { ...initialLocalState, ...(state?.local ?? {}) },
  };
};

export const documentModelCreateDocument: CreateDocument<
  DocumentModelDocument
> = (state) => {
  const document = baseCreateDocument(documentModelCreateState, state);
  document.header.documentType = documentType;

  return document;
};

export const documentModelSaveToFile: SaveToFile = (document, path, name) => {
  return baseSaveToFile(document, path, documentModelFileExtension, name);
};

export const documentModelSaveToFileHandle: SaveToFileHandle = (
  document,
  input,
) => {
  return baseSaveToFileHandle(document, input);
};

export const documentModelLoadFromFile: LoadFromFile<DocumentModelDocument> = (
  path,
) => {
  return baseLoadFromFile(path, documentModelReducer);
};

export const documentModelLoadFromInput: LoadFromInput<
  DocumentModelDocument
> = (input) => {
  return baseLoadFromInput(input, documentModelReducer);
};
