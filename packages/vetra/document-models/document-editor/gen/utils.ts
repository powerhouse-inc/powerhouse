import type { DocumentModelUtils } from "document-model";
import {
  baseCreateDocument,
  baseSaveToFile,
  baseSaveToFileHandle,
  baseLoadFromFile,
  baseLoadFromInput,
  defaultBaseState,
  generateId,
} from "document-model";
import type {
  DocumentEditorDocument,
  DocumentEditorState,
  DocumentEditorLocalState,
} from "./types.js";
import { reducer } from "./reducer.js";

export const initialGlobalState: DocumentEditorState = {
  name: "",
  documentTypes: [],
  status: "DRAFT",
};
export const initialLocalState: DocumentEditorLocalState = {};

const utils: DocumentModelUtils<DocumentEditorDocument> = {
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

    document.header.documentType = "powerhouse/document-editor";

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
