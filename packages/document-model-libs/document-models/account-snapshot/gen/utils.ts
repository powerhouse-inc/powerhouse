import { DocumentModelUtils, utils as base } from "document-model/document";
import {
  AccountSnapshotAction,
  AccountSnapshotState,
  AccountSnapshotLocalState,
} from "./types";
import { reducer } from "./reducer";

export const initialGlobalState: AccountSnapshotState = {
  id: "",
  ownerId: "",
  ownerType: "",
  period: "",
  start: "",
  end: "",
  actualsComparison: [],
  snapshotAccount: [],
};
export const initialLocalState: AccountSnapshotLocalState = {};

const utils: DocumentModelUtils<
  AccountSnapshotState,
  AccountSnapshotAction,
  AccountSnapshotLocalState
> = {
  fileExtension: "phas",
  createState(state) {
    return {
      global: { ...initialGlobalState, ...state?.global },
      local: { ...initialLocalState, ...state?.local },
    };
  },
  createExtendedState(extendedState) {
    return base.createExtendedState(
      { ...extendedState, documentType: "powerhouse/account-snapshot" },
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
    return base.saveToFile(document, path, "phas", name);
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
