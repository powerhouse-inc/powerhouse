import type { DocumentModelUtils } from "document-model";
import {
  baseCreateDocument,
  baseLoadFromInput,
  baseSaveToFileHandle,
  defaultBaseState,
  generateId,
} from "document-model";
import { reducer } from "./reducer.js";
import type {
  VetraPackageDocument,
  VetraPackageLocalState,
  VetraPackageState,
} from "./types.js";

export const initialGlobalState: VetraPackageState = {
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

const utils: DocumentModelUtils<VetraPackageDocument> = {
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

    document.header.documentType = "powerhouse/package";

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
};

export default utils;
