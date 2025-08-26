import {
  type CreateDocument,
  type CreateState,
  type LoadFromFile,
  type LoadFromInput,
  baseCreateDocument,
  baseSaveToFile,
  baseSaveToFileHandle,
  baseLoadFromFile,
  baseLoadFromInput,
  defaultBaseState,
  generateId,
} from "document-model";
import {
  type ProcessorModuleState,
  type ProcessorModuleLocalState,
} from "./types.js";
import { ProcessorModulePHState } from "./ph-factories.js";
import { reducer } from "./reducer.js";

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
  createState,
  createDocument,
  saveToFile,
  saveToFileHandle,
  loadFromFile,
  loadFromInput,
};

export default utils;
