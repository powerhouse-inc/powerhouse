import type { DocumentModelUtils } from "document-model";
import {
  baseCreateDocument,
  baseSaveToFileHandle,
  baseLoadFromInput,
  defaultBaseState,
  generateId,
} from "document-model/core";
import type {
  TestEmptyCodesGlobalState,
  TestEmptyCodesLocalState,
} from "./types.js";
import type { TestEmptyCodesPHState } from "./types.js";
import { reducer } from "./reducer.js";
import { testEmptyCodesDocumentType } from "./document-type.js";
import {
  isTestEmptyCodesDocument,
  assertIsTestEmptyCodesDocument,
  isTestEmptyCodesState,
  assertIsTestEmptyCodesState,
} from "./document-schema.js";

export const initialGlobalState: TestEmptyCodesGlobalState = { value: "" };
export const initialLocalState: TestEmptyCodesLocalState = {};

export const utils: DocumentModelUtils<TestEmptyCodesPHState> = {
  fileExtension: ".tec",
  createState(state) {
    return {
      ...defaultBaseState(),
      global: { ...initialGlobalState, ...state?.global },
      local: { ...initialLocalState, ...state?.local },
    };
  },
  createDocument(state) {
    const document = baseCreateDocument(utils.createState, state);

    document.header.documentType = testEmptyCodesDocumentType;

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
    return isTestEmptyCodesState(state);
  },
  assertIsStateOfType(state) {
    return assertIsTestEmptyCodesState(state);
  },
  isDocumentOfType(document) {
    return isTestEmptyCodesDocument(document);
  },
  assertIsDocumentOfType(document) {
    return assertIsTestEmptyCodesDocument(document);
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
