import type { DocumentModelUtils } from "document-model";
import {
  baseCreateDocument,
  baseSaveToFileHandle,
  baseLoadFromInput,
  defaultBaseState,
  generateId,
} from "document-model/core";
import type { TestDocGlobalState, TestDocLocalState } from "./types.js";
import type { TestDocPHState } from "./types.js";
import { reducer } from "./reducer.js";
import { testDocDocumentType } from "./document-type.js";
import {
  isTestDocDocument,
  assertIsTestDocDocument,
  isTestDocState,
  assertIsTestDocState,
} from "./document-schema.js";

export const initialGlobalState: TestDocGlobalState = {
  id: 0,
  name: "",
  description: null,
  value: "",
};
export const initialLocalState: TestDocLocalState = {};

export const utils: DocumentModelUtils<TestDocPHState> = {
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

    document.header.documentType = testDocDocumentType;

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
    return isTestDocState(state);
  },
  assertIsStateOfType(state) {
    return assertIsTestDocState(state);
  },
  isDocumentOfType(document) {
    return isTestDocDocument(document);
  },
  assertIsDocumentOfType(document) {
    return assertIsTestDocDocument(document);
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
