import type { DocumentModelUtils } from "document-model";
import {
  baseCreateDocument,
  baseSaveToFileHandle,
  baseLoadFromInput,
  defaultBaseState,
  generateId,
} from "document-model/core";
import type {
  DocumentEditorGlobalState,
  DocumentEditorLocalState,
} from "./types.js";
import type { DocumentEditorPHState } from "./types.js";
import { reducer } from "./reducer.js";
import { documentEditorDocumentType } from "./document-type.js";
import {
  isDocumentEditorDocument,
  assertIsDocumentEditorDocument,
  isDocumentEditorState,
  assertIsDocumentEditorState,
} from "./document-schema.js";

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

export const createDocument = utils.createDocument;
export const createState = utils.createState;
export const saveToFileHandle = utils.saveToFileHandle;
export const loadFromInput = utils.loadFromInput;
export const isStateOfType = utils.isStateOfType;
export const assertIsStateOfType = utils.assertIsStateOfType;
export const isDocumentOfType = utils.isDocumentOfType;
export const assertIsDocumentOfType = utils.assertIsDocumentOfType;
