import type {
  CreateDocument,
  CreateState,
  DocumentModelDocument,
  LoadFromInput,
  SaveToFileHandle,
} from "document-model";
import {
  baseCreateDocument,
  baseLoadFromInput,
  baseSaveToFileHandle,
  defaultBaseState,
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

export const documentModelSaveToFileHandle: SaveToFileHandle = (
  document,
  input,
) => {
  return baseSaveToFileHandle(document, input);
};

export const documentModelLoadFromInput: LoadFromInput<
  DocumentModelDocument
> = (input) => {
  return baseLoadFromInput(input, documentModelReducer);
};
