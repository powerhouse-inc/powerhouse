import type {
  DocumentDriveDocument,
  DocumentDriveLocalState,
  DocumentDriveState,
  DocumentDriveUtils,
} from "document-drive";
import { driveDocumentReducer } from "document-drive";
import type {
  BaseState,
  CreateDocument,
  CreateState,
  PartialState,
} from "document-model";
import {
  baseCreateDocument,
  baseLoadFromFile,
  baseLoadFromInput,
  baseSaveToFile,
  baseSaveToFileHandle,
  defaultBaseState,
  generateId,
} from "document-model";
import { driveDocumentType } from "document-drive";

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

export function createDriveState(
  state:
    | PartialState<
        BaseState<
          PartialState<DocumentDriveState>,
          PartialState<DocumentDriveLocalState>
        >
      >
    | undefined,
) {
  return {
    ...defaultBaseState(),
    global: { ...initialGlobalState, ...state?.global },
    local: { ...initialLocalState, ...state?.local },
  };
}

const utils: DocumentDriveUtils = {
  fileExtension: "phdd",
  createState: createDriveState,
  createDocument(state) {
    const document = baseCreateDocument(utils.createState, state);

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
    return baseLoadFromFile(path, driveDocumentReducer);
  },
  loadFromInput(input) {
    return baseLoadFromInput(input, driveDocumentReducer);
  },
};

export const createDocument: CreateDocument<DocumentDriveDocument> =
  utils.createDocument;
export const createState: CreateState<DocumentDriveDocument> =
  utils.createState;

export { utils as DriveUtils };
