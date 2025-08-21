import {
  type DocumentModelUtils,
  baseCreateDocument,
  baseSaveToFile,
  baseSaveToFileHandle,
  baseLoadFromFile,
  baseLoadFromInput,
  defaultBaseState,
  generateId,
} from "document-model";
import {
  type ProcessorModuleDocument,
  type ProcessorModuleState,
  type ProcessorModuleLocalState,
} from "./types.js";
import { reducer } from "./reducer.js";

export const initialGlobalState: ProcessorModuleState = {
  name: "",
  type: "",
  documentTypes: [],
  status: "DRAFT",
};
export const initialLocalState: ProcessorModuleLocalState = {};

const utils: DocumentModelUtils<ProcessorModuleDocument> = {
  fileExtension: ".phdm",
  createState(state) {
    return {
      ...defaultBaseState(),
      
      global: { ...initialGlobalState, ...state?.global },
      local: { ...initialLocalState, ...state?.local },
    };
  },
  createDocument(state) {
    const document = baseCreateDocument(
      utils.createState,
      state,
    );

    document.header.documentType = "powerhouse/processor";

    // for backwards compatibility, but this is NOT a valid signed document id
    document.header.id = generateId();

    return document;
  },
  saveToFile(document, path, name) {
    return baseSaveToFile(document, path, ".phdm", name);
  },
  saveToFileHandle(document, input) {
    return baseSaveToFileHandle(document, input);
  },
  loadFromFile(path) {
    return baseLoadFromFile(path, reducer);
  },
  loadFromInput(input) {
    return baseLoadFromInput(input, reducer);
  },
};

export default utils;
