import {
  CreateDocument,
  CreateExtendedState,
  CreateState,
  type DocumentModelUtils,
  baseCreateDocument,
  baseCreateExtendedState,
  baseLoadFromFile,
  baseLoadFromInput,
  baseSaveToFile,
  baseSaveToFileHandle,
} from "document-model";
import { reducer } from "./reducer.js";
import {
  type DocumentDriveDocument,
  type DocumentDriveLocalState,
  type DocumentDriveState,
} from "./types.js";

export const initialGlobalState: DocumentDriveState = {
  name: "",
  nodes: [],
  icon: null,
};
export const initialLocalState: DocumentDriveLocalState = {
  listeners: [],
  triggers: [],
  sharingType: "private",
  availableOffline: false,
};

export type DocumentDriveUtils = DocumentModelUtils<DocumentDriveDocument>;

const utils: DocumentDriveUtils = {
  fileExtension: "phdd",
  createState(state) {
    return {
      global: { ...initialGlobalState, ...state?.global },
      local: { ...initialLocalState, ...state?.local },
    };
  },
  createExtendedState(extendedState) {
    return baseCreateExtendedState(
      { ...extendedState, documentType: "powerhouse/document-drive" },
      utils.createState,
    );
  },
  createDocument(state) {
    return baseCreateDocument(
      utils.createExtendedState(state),
      utils.createState,
    );
  },
  saveToFile(document, path, name) {
    return baseSaveToFile(document, path, "phdd", name);
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

export const createDocument: CreateDocument<DocumentDriveDocument> =
  utils.createDocument;
export const createExtendedState: CreateExtendedState<DocumentDriveDocument> =
  utils.createExtendedState;
export const createState: CreateState<DocumentDriveDocument> =
  utils.createState;


export default utils;
