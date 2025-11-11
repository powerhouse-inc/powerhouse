import type { DocumentModelUtils } from "document-model";
import {
  baseCreateDocument,
  baseSaveToFileHandle,
  baseLoadFromInput,
  defaultBaseState,
  generateId,
} from "document-model/core";
import type {
  VetraPackageGlobalState,
  VetraPackageLocalState,
} from "./types.js";
import type { VetraPackagePHState } from "./types.js";
import { reducer } from "./reducer.js";
import { vetraPackageDocumentType } from "./document-type.js";
import {
  isVetraPackageDocument,
  assertIsVetraPackageDocument,
  isVetraPackageState,
  assertIsVetraPackageState,
} from "./document-schema.js";

export const initialGlobalState: VetraPackageGlobalState = {
  name: null,
  description: null,
  category: null,
  author: {
    name: null,
    website: null,
  },
  keywords: [],
  githubUrl: null,
  npmUrl: null,
};
export const initialLocalState: VetraPackageLocalState = {};

export const utils: DocumentModelUtils<VetraPackagePHState> = {
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

    document.header.documentType = vetraPackageDocumentType;

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
    return isVetraPackageState(state);
  },
  assertIsStateOfType(state) {
    return assertIsVetraPackageState(state);
  },
  isDocumentOfType(document) {
    return isVetraPackageDocument(document);
  },
  assertIsDocumentOfType(document) {
    return assertIsVetraPackageDocument(document);
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
