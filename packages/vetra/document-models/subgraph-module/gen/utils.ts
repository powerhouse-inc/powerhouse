import type { DocumentModelUtils } from "document-model";
import {
  baseCreateDocument,
  baseSaveToFileHandle,
  baseLoadFromInput,
  defaultBaseState,
  generateId,
} from "document-model/core";
import type {
  SubgraphModuleGlobalState,
  SubgraphModuleLocalState,
} from "./types.js";
import type { SubgraphModulePHState } from "./types.js";
import { reducer } from "./reducer.js";
import { subgraphModuleDocumentType } from "./document-type.js";
import {
  isSubgraphModuleDocument,
  assertIsSubgraphModuleDocument,
  isSubgraphModuleState,
  assertIsSubgraphModuleState,
} from "./document-schema.js";

export const initialGlobalState: SubgraphModuleGlobalState = {
  name: "",
  status: "DRAFT",
};
export const initialLocalState: SubgraphModuleLocalState = {};

export const utils: DocumentModelUtils<SubgraphModulePHState> = {
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

    document.header.documentType = subgraphModuleDocumentType;

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
    return isSubgraphModuleState(state);
  },
  assertIsStateOfType(state) {
    return assertIsSubgraphModuleState(state);
  },
  isDocumentOfType(document) {
    return isSubgraphModuleDocument(document);
  },
  assertIsDocumentOfType(document) {
    return assertIsSubgraphModuleDocument(document);
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
