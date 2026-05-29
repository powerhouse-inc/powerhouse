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
  assertIsProcessorModuleDocument,
  assertIsProcessorModuleState,
  isProcessorModuleDocument,
  isProcessorModuleState,
} from "./document-schema.js";
import { processorModuleDocumentType } from "./document-type.js";
import { reducer } from "./reducer.js";
import type {
  ProcessorModuleGlobalState,
  ProcessorModuleLocalState,
  ProcessorModulePHState,
} from "./types.js";

export const initialGlobalState: ProcessorModuleGlobalState = {
  name: "",
  type: "",
  documentTypes: [],
  status: "DRAFT",
  processorApps: [],
};
export const initialLocalState: ProcessorModuleLocalState = {};

export const utils: DocumentModelUtils<ProcessorModulePHState> = {
  fileExtension: ".processor",
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
      processorModuleDocumentType,
    );
  },
  saveToFileHandle(document, input) {
    return baseSaveToFileHandle(document, input);
  },
  loadFromInput(input) {
    return baseLoadFromInput(input, reducer);
  },
  isStateOfType(state) {
    return isProcessorModuleState(state);
  },
  assertIsStateOfType(state) {
    return assertIsProcessorModuleState(state);
  },
  isDocumentOfType(document) {
    return isProcessorModuleDocument(document);
  },
  assertIsDocumentOfType(document) {
    return assertIsProcessorModuleDocument(document);
  },
};
