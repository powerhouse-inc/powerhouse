/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { DocumentModelUtils } from "document-model";
import {
  baseCreateDocument,
  baseLoadFromInput,
  baseSaveToFileHandle,
  defaultBaseState,
  generateId,
} from "document-model";
import {
  assertIsBrandSheetDocument,
  assertIsBrandSheetState,
  isBrandSheetDocument,
  isBrandSheetState,
} from "./document-schema.js";
import { brandSheetDocumentType } from "./document-type.js";
import { reducer } from "./reducer.js";
import type {
  BrandSheetGlobalState,
  BrandSheetLocalState,
  BrandSheetPHState,
} from "./types.js";

export const initialGlobalState: BrandSheetGlobalState = {
  name: null,
  maxim: null,
  concept: null,
  logos: [],
  colors: [],
  typography: [],
  voice: null,
  imagery: null,
  agentFeedback: {
    readyForFeedback: false,
    suggestions: [],
  },
};
export const initialLocalState: BrandSheetLocalState = {};

export const utils: DocumentModelUtils<BrandSheetPHState> = {
  fileExtension: "brs",
  createState(state) {
    return {
      ...defaultBaseState(),
      global: { ...initialGlobalState, ...state?.global },
      local: { ...initialLocalState, ...state?.local },
    };
  },
  createDocument(state) {
    const document = baseCreateDocument(utils.createState, state);

    document.header.documentType = brandSheetDocumentType;

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
    return isBrandSheetState(state);
  },
  assertIsStateOfType(state) {
    return assertIsBrandSheetState(state);
  },
  isDocumentOfType(document) {
    return isBrandSheetDocument(document);
  },
  assertIsDocumentOfType(document) {
    return assertIsBrandSheetDocument(document);
  },
};
