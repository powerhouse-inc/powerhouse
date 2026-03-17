import type {
  AssertIsDocumentOfType,
  AssertIsStateOfType,
  CreateState,
  DocumentModelDocument,
  DocumentModelGlobalState,
  DocumentModelPHState,
  IsDocumentOfType,
  IsStateOfType,
} from "@powerhousedao/shared/document-model";
import {
  assertIsDocumentModelDocument,
  assertIsDocumentModelState,
  baseCreateDocument,
  defaultBaseState,
  documentModelDocumentType,
  documentModelInitialGlobalState,
  documentModelInitialLocalState,
  isDocumentModelDocument,
  isDocumentModelState,
} from "@powerhousedao/shared/document-model";

export const isStateOfType: IsStateOfType<DocumentModelPHState> = (state) => {
  return isDocumentModelState(state);
};

export const assertIsStateOfType: AssertIsStateOfType<DocumentModelPHState> = (
  state,
) => {
  assertIsDocumentModelState(state);
};

export const isDocumentOfType: IsDocumentOfType<DocumentModelPHState> = (
  document,
) => {
  return isDocumentModelDocument(document);
};

export const assertIsDocumentOfType: AssertIsDocumentOfType<
  DocumentModelPHState
> = (document) => {
  assertIsDocumentModelDocument(document);
};
export const documentModelCreateState: CreateState<DocumentModelPHState> = (
  state,
) => {
  return {
    ...defaultBaseState(),
    global: {
      ...documentModelInitialGlobalState,
      ...((state?.global ?? {}) as DocumentModelGlobalState),
    },
    local: { ...documentModelInitialLocalState, ...(state?.local ?? {}) },
  };
};

export function documentModelCreateDocument(
  state?: Partial<DocumentModelPHState>,
): DocumentModelDocument {
  const document = baseCreateDocument(documentModelCreateState, state);
  document.header.documentType = documentModelDocumentType;

  return document;
}
