import type {
  AssertIsDocumentOfType,
  AssertIsStateOfType,
  CreateState,
  IsDocumentOfType,
  IsStateOfType,
  PHBaseState,
} from "document-model";
import {
  assertIsDocumentModelDocument,
  assertIsDocumentModelState,
  documentModelDocumentType,
  isDocumentModelDocument,
  isDocumentModelState,
} from "document-model";
import {
  baseCreateDocument,
  createBaseState,
  defaultBaseState,
} from "document-model/core";
import {
  documentModelInitialGlobalState,
  documentModelInitialLocalState,
} from "./constants.js";
import type {
  DocumentModelDocument,
  DocumentModelGlobalState,
  DocumentModelLocalState,
  DocumentModelPHState,
} from "./types.js";

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

export function defaultGlobalState(): DocumentModelGlobalState {
  return {
    ...defaultBaseState(),
    author: {
      name: "",
      website: "",
    },
    description: "",
    extension: "",
    id: "",
    name: "",
    specifications: [],
  };
}

export function defaultLocalState(): DocumentModelLocalState {
  return {};
}

export function defaultPHState(): DocumentModelPHState {
  return {
    ...defaultBaseState(),
    global: defaultGlobalState(),
    local: defaultLocalState(),
  };
}

export function createGlobalState(
  state?: Partial<DocumentModelGlobalState>,
): DocumentModelGlobalState {
  return {
    ...defaultGlobalState(),
    ...(state || {}),
  } as DocumentModelGlobalState;
}

export function createLocalState(
  state?: Partial<DocumentModelLocalState>,
): DocumentModelLocalState {
  return {
    ...defaultLocalState(),
    ...(state || {}),
  } as DocumentModelLocalState;
}

export function createState(
  baseState?: Partial<PHBaseState>,
  globalState?: Partial<DocumentModelGlobalState>,
  localState?: Partial<DocumentModelLocalState>,
): DocumentModelPHState {
  return {
    ...createBaseState(baseState?.auth, baseState?.document),
    global: createGlobalState(globalState),
    local: createLocalState(localState),
  };
}

export function documentModelCreateDocument(
  state?: Partial<DocumentModelPHState>,
): DocumentModelDocument {
  const document = baseCreateDocument(documentModelCreateState, state);
  document.header.documentType = documentModelDocumentType;

  return document;
}

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
