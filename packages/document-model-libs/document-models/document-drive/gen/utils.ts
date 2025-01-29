import { DocumentModelUtils, utils as base } from "document-model/document";
import {
  DocumentDriveAction,
  DocumentDriveState,
  DocumentDriveLocalState,
} from "./types";
import { reducer } from "./reducer";

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

const utils: DocumentModelUtils<
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
    return base.createExtendedState(
      { ...extendedState, documentType: "powerhouse/document-drive" },
      utils.createState,
    );
  },
  createDocument(state) {
    return base.createDocument(
      utils.createExtendedState(state),
      utils.createState,
    );
  },
  saveToFile(document, path, name) {
    return base.saveToFile(document, path, "phdd", name);
  },
  saveToFileHandle(document, input) {
    return base.saveToFileHandle(document, input);
  },
  loadFromFile(path) {
    return base.loadFromFile(path, reducer);
  },
  loadFromInput(input) {
    return base.loadFromInput(input, reducer);
  },
};

export default utils;
