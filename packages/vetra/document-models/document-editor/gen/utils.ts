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
  type DocumentEditorState,
  type DocumentEditorLocalState,
} from "./types.js";
import { DocumentEditorPHState } from "./ph-factories.js";
import { reducer } from "./reducer.js";

export const initialGlobalState: DocumentEditorState = {
  name: "",
  documentTypes: [],
  status: "DRAFT",
};
export const initialLocalState: DocumentEditorLocalState = {};

export const createState: CreateState<DocumentEditorPHState> = (state) => {
  return {
    ...defaultBaseState(),
    global: { ...initialGlobalState, ...(state?.global ?? {}) },
    local: { ...initialLocalState, ...(state?.local ?? {}) },
  };
};

export const createDocument: CreateDocument<DocumentEditorPHState> = (
  state,
) => {
  const document = baseCreateDocument(createState, state);
  document.header.documentType = "powerhouse/document-editor";
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

export const loadFromFile: LoadFromFile<DocumentEditorPHState> = (path) => {
  return baseLoadFromFile(path, reducer);
};

export const loadFromInput: LoadFromInput<DocumentEditorPHState> = (input) => {
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
