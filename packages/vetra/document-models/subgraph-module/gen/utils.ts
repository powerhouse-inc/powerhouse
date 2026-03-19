import type { DocumentModelUtils } from "@powerhousedao/shared/document-model";
import {
  baseCreateDocument,
  baseLoadFromInput,
  baseSaveToFileHandle,
  defaultBaseState,
  generateId,
} from "@powerhousedao/shared/document-model";
import {
  assertIsSubgraphModuleDocument,
  assertIsSubgraphModuleState,
  isSubgraphModuleDocument,
  isSubgraphModuleState,
} from "./document-schema.js";
import { subgraphModuleDocumentType } from "./document-type.js";
import { reducer } from "./reducer.js";
import type {
  SubgraphModuleGlobalState,
  SubgraphModuleLocalState,
  SubgraphModulePHState,
} from "./types.js";

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
