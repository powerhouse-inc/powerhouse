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
  assertIsWorkBreakdownStructureDocument,
  assertIsWorkBreakdownStructureState,
  isWorkBreakdownStructureDocument,
  isWorkBreakdownStructureState,
} from "./document-schema.js";
import { workBreakdownStructureDocumentType } from "./document-type.js";
import { reducer } from "./reducer.js";
import type {
  WorkBreakdownStructureGlobalState,
  WorkBreakdownStructureLocalState,
  WorkBreakdownStructurePHState,
} from "./types.js";

export const initialGlobalState: WorkBreakdownStructureGlobalState = {
  feature: null,
  name: null,
  description: null,
  packages: [],
  tasks: [],
  status: "DRAFT",
};
export const initialLocalState: WorkBreakdownStructureLocalState = {};

export const utils: DocumentModelUtils<WorkBreakdownStructurePHState> = {
  fileExtension: "wbs",
  createState(state) {
    return {
      ...defaultBaseState(),
      global: { ...initialGlobalState, ...state?.global },
      local: { ...initialLocalState, ...state?.local },
    };
  },
  createDocument(state) {
    const document = baseCreateDocument(utils.createState, state);

    document.header.documentType = workBreakdownStructureDocumentType;

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
    return isWorkBreakdownStructureState(state);
  },
  assertIsStateOfType(state) {
    return assertIsWorkBreakdownStructureState(state);
  },
  isDocumentOfType(document) {
    return isWorkBreakdownStructureDocument(document);
  },
  assertIsDocumentOfType(document) {
    return assertIsWorkBreakdownStructureDocument(document);
  },
};
