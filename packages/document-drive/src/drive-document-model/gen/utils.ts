import { DocumentModelUtils } from "document-model";
import { reducer } from "./reducer.js";
import {
    DocumentDriveAction,
    DocumentDriveLocalState,
    DocumentDriveState,
} from "./types.js";

export const initialGlobalState: DocumentDriveState = {
  id: "",
  name: "",
  nodes: [],
  icon: null,
  slug: null,
};
export const initialLocalState: DocumentDriveLocalState = {
  listeners: [],
  triggers: [],
  sharingType: "private",
  availableOffline: false,
};

export const utils: DocumentModelUtils<
  DocumentDriveState,
  DocumentDriveAction,
  DocumentDriveLocalState
> = {
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


