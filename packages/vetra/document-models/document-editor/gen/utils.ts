import type { DocumentModelUtils } from "document-model";
import {
  baseCreateDocument,
  baseLoadFromInput,
  baseSaveToFileHandle,
  defaultBaseState,
  generateId,
} from "document-model";
import {
  assertIsDocumentEditorDocument,
  assertIsDocumentEditorState,
  isDocumentEditorDocument,
  isDocumentEditorState,
} from "./document-schema.js";
import { documentEditorDocumentType } from "./document-type.js";
import { reducer } from "./reducer.js";
import type {
  DocumentEditorGlobalState,
  DocumentEditorLocalState,
  DocumentEditorPHState,
} from "./types.js";

export const initialGlobalState: DocumentEditorGlobalState = {
  name: "",
  documentTypes: [],
  status: "DRAFT",
};
export const initialLocalState: DocumentEditorLocalState = {};

export const utils: DocumentModelUtils<DocumentEditorPHState> = {
  fileExtension: ".phdm",
  createState(state) {
    return {
      ...defaultBaseState(),
      global: { ...initialGlobalState, ...state?.global },
      local: { ...initialLocalState, ...state?.local },
    };
  },
  createDocument(state) {
    const document = baseCreateDocument(utils.createState, state);

    document.header.documentType = documentEditorDocumentType;

    // for backwards compatibility, but this is NOT a valid signed document id
    document.header.id = generateId();

    return document;
  },
  saveToFileHandle(document, input) {
    return baseSaveToFileHandle(document, input);
  },
  loadFromInput(input) {
    return baseLoadFromInput(input, reducer);
  },
  isStateOfType(state) {
    return isDocumentEditorState(state);
  },
  assertIsStateOfType(state) {
    return assertIsDocumentEditorState(state);
  },
  isDocumentOfType(document) {
    return isDocumentEditorDocument(document);
  },
  assertIsDocumentOfType(document) {
    return assertIsDocumentEditorDocument(document);
  },
};
