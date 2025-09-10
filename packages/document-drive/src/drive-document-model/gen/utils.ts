import { driveDocumentType } from "#drive-document-model/constants";
import {
  CreateDocument,
  CreateState,
  type DocumentModelUtils,
  baseCreateDocument,
  baseLoadFromFile,
  baseLoadFromInput,
  baseSaveToFile,
  baseSaveToFileHandle,
  defaultBaseState,
  generateId,
} from "document-model";
import { DocumentDrivePHState } from "./ph-factories.js";
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

export type DocumentDriveUtils = DocumentModelUtils<DocumentDrivePHState>;

const utils: DocumentDriveUtils = {
  fileExtension: "phdd",
  createState(state) {
    return {
      ...defaultBaseState(),
      global: { ...initialGlobalState, ...state?.global },
      local: { ...initialLocalState, ...state?.local },
    };
  },
  createDocument(state) {
    const document = baseCreateDocument<DocumentDrivePHState>(
      utils.createState,
      state,
    );

    document.header.documentType = driveDocumentType;

    // for backward compatibility -- but this is NOT a valid document id
    document.header.id = generateId();

    return document;
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

export const createDocument: CreateDocument<DocumentDrivePHState> =
  utils.createDocument;
export const createState: CreateState<DocumentDrivePHState> = utils.createState;

export default utils;
