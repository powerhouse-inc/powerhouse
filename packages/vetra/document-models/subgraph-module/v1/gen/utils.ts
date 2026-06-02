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
} from "document-model";
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
  fileExtension: ".subgraph",
  createState(state) {
    return {
      ...defaultBaseState(),
      global: { ...initialGlobalState, ...state?.global },
      local: { ...initialLocalState, ...state?.local },
    };
  },
  createDocument(state) {
    return baseCreateDocument(
      utils.createState,
      state,
      subgraphModuleDocumentType,
    );
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
