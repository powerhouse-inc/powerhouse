import type {
  CreateDocument,
  CreateState,
  LoadFromFile,
  LoadFromInput,
  SaveToFile,
  SaveToFileHandle,
} from "document-model";
import {
  baseCreateDocument,
  baseLoadFromFile,
  baseLoadFromInput,
  baseSaveToFile,
  baseSaveToFileHandle,
  defaultBaseState,
} from "document-model";
import {
  documentModelState,
  documentType,
  fileExtension,
  initialLocalState,
} from "./constants.js";
import { documentModelReducer } from "document-model";
import type { DocumentModelDocument } from "./types.js";

export { fileExtension } from "./constants.js";

export const createState: CreateState<DocumentModelDocument> = (state) => {
  return {
    ...defaultBaseState(),
    global: { ...documentModelState, ...(state?.global ?? {}) },
    local: { ...initialLocalState, ...(state?.local ?? {}) },
  };
};

export const createDocument: CreateDocument<DocumentModelDocument> = (
  state,
) => {
  const document = baseCreateDocument(createState, state);
  document.header.documentType = documentType;

  return document;
};

export const saveToFile: SaveToFile = (document, path, name) => {
  return baseSaveToFile(document, path, fileExtension, name);
};

export const saveToFileHandle: SaveToFileHandle = (document, input) => {
  return baseSaveToFileHandle(document, input);
};

export const loadFromFile: LoadFromFile<DocumentModelDocument> = (path) => {
  return baseLoadFromFile(path, documentModelReducer);
};

export const loadFromInput: LoadFromInput<DocumentModelDocument> = (input) => {
  return baseLoadFromInput(input, documentModelReducer);
};
