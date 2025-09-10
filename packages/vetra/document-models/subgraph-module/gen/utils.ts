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
  SubgraphModuleDocument,
  SubgraphModuleLocalState,
  SubgraphModuleState,
} from "./types.js";

export const initialGlobalState: SubgraphModuleState = {
  name: "",
  status: "DRAFT",
};
export const initialLocalState: SubgraphModuleLocalState = {};

export const createState: CreateState<SubgraphModulePHState> = (state) => {
  return {
    ...defaultBaseState(),
    global: { ...initialGlobalState, ...(state?.global ?? {}) },
    local: { ...initialLocalState, ...(state?.local ?? {}) },
  };
};

export const createDocument: CreateDocument<SubgraphModulePHState> = (
  state,
) => {
  const document = baseCreateDocument(createState, state);
  document.header.documentType = "powerhouse/subgraph";
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

export const loadFromFile: LoadFromFile<SubgraphModulePHState> = (path) => {
  return baseLoadFromFile(path, reducer);
};

export const loadFromInput: LoadFromInput<SubgraphModulePHState> = (input) => {
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

    document.header.documentType = "powerhouse/subgraph";

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
