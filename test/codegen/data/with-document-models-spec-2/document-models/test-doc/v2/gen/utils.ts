import type { DocumentModelUtils } from "document-model";
import {
  baseCreateDocument,
  baseSaveToFileHandle,
  baseLoadFromInput,
  defaultBaseState,
  generateId,
} from "document-model";
import { reducer } from "./reducer.js";
import { testDocDocumentType } from "./document-type.js";
import {
  assertIsTestDocDocument,
  assertIsTestDocState,
  isTestDocDocument,
  isTestDocState,
} from "./document-schema.js";
import type {
  TestDocGlobalState,
  TestDocLocalState,
  TestDocPHState,
} from "./types.js";

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
