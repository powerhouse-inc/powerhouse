import type { DocumentModelUtils } from "@powerhousedao/shared/document-model";
import {
  baseCreateDocument,
  baseLoadFromInput,
  baseSaveToFileHandle,
  defaultBaseState,
  generateId,
} from "@powerhousedao/shared/document-model";
import {
  assertIsVetraPackageDocument,
  assertIsVetraPackageState,
  isVetraPackageDocument,
  isVetraPackageState,
} from "./document-schema.js";
import { vetraPackageDocumentType } from "./document-type.js";
import { reducer } from "./reducer.js";
import type {
  VetraPackageGlobalState,
  VetraPackageLocalState,
  VetraPackagePHState,
} from "./types.js";

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
