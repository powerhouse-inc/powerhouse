import type {
  CreateDocument,
  CreateState,
  DocumentModelGlobalState,
  DocumentModelPHState,
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

export const documentModelCreateState: CreateState<DocumentModelPHState> = (
  state,
) => {
  return {
    ...defaultBaseState(),
    global: {
      ...documentModelState,
      ...((state?.global ?? {}) as DocumentModelGlobalState),
    },
    local: { ...initialLocalState, ...(state?.local ?? {}) },
  };
};

export const documentModelCreateDocument: CreateDocument<
  DocumentModelPHState
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

export const documentModelLoadFromInput: LoadFromInput<DocumentModelPHState> = (
  input,
) => {
  return baseLoadFromInput(input, documentModelReducer);
};
