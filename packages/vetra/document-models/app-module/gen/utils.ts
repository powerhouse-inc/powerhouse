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
import { type AppModuleState, type AppModuleLocalState } from "./types.js";
import { AppModulePHState } from "./ph-factories.js";
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
  createState,
  createDocument,
  saveToFile,
  saveToFileHandle,
  loadFromFile,
  loadFromInput,
};

export default utils;
