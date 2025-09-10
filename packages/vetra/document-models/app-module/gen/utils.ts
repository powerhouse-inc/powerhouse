import type { DocumentModelUtils } from "document-model";
import {
  baseCreateDocument,
  baseSaveToFileHandle,
  baseLoadFromInput,
  defaultBaseState,
  generateId,
} from "document-model";
import type {
  AppModuleDocument,
  AppModuleState,
  AppModuleLocalState,
} from "./types.js";
import { reducer } from "./reducer.js";

export const initialGlobalState: AppModuleState = {
  name: "",
  status: "DRAFT",
};
export const initialLocalState: AppModuleLocalState = {};

export const createState: CreateState<AppModulePHState> = (state) => {
  return {
    ...defaultBaseState(),
    global: { ...initialGlobalState, ...(state?.global ?? {}) },
    local: { ...initialLocalState, ...(state?.local ?? {}) },
  };
};

export const createDocument: CreateDocument<AppModulePHState> = (state) => {
  const document = baseCreateDocument(createState, state);
  document.header.documentType = "powerhouse/app";
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

export const loadFromFile: LoadFromFile<AppModulePHState> = (path) => {
  return baseLoadFromFile(path, reducer);
};

export const loadFromInput: LoadFromInput<AppModulePHState> = (input) => {
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

    document.header.documentType = "powerhouse/app";

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
