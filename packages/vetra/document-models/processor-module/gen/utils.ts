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
  ProcessorModuleDocument,
  ProcessorModuleLocalState,
  ProcessorModuleState,
} from "./types.js";

export const initialGlobalState: ProcessorModuleState = {
  name: "",
  type: "",
  documentTypes: [],
  status: "DRAFT",
};
export const initialLocalState: ProcessorModuleLocalState = {};

export const createState: CreateState<ProcessorModulePHState> = (state) => {
  return {
    ...defaultBaseState(),
    global: { ...initialGlobalState, ...(state?.global ?? {}) },
    local: { ...initialLocalState, ...(state?.local ?? {}) },
  };
};

export const createDocument: CreateDocument<ProcessorModulePHState> = (
  state,
) => {
  const document = baseCreateDocument(createState, state);
  document.header.documentType = "powerhouse/processor";
  // for backwards compatibility, but this is NOT a valid signed document id
  document.header.id = generateId();
  return document;
};

export const saveToFile = (document: any, path: string, name?: string) => {
  return baseSaveToFile(document, path, ".phdm", name);
};

export const saveToFileHandle = (document: any, input: any) => {
  return baseSaveToFileHandle(document, input);
};

export const loadFromFile: LoadFromFile<ProcessorModulePHState> = (path) => {
  return baseLoadFromFile(path, reducer);
};

export const loadFromInput: LoadFromInput<ProcessorModulePHState> = (input) => {
  return baseLoadFromInput(input, reducer);
};

const utils = {
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

    document.header.documentType = "powerhouse/processor";

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
