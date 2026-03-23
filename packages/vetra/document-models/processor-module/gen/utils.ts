import type { DocumentModelUtils } from "@powerhousedao/shared/document-model";
import {
  baseCreateDocument,
  baseLoadFromInput,
  baseSaveToFileHandle,
  defaultBaseState,
  generateId,
} from "@powerhousedao/shared/document-model";
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

    document.header.documentType = processorModuleDocumentType;

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
