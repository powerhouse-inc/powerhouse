import { baseCreateDocument, baseCreateExtendedState, baseLoadFromFile, baseLoadFromInput, baseSaveToFile, baseSaveToFileHandle } from "document-model";
import { AccountSnapshotAction } from "./actions.js";
import { AccountSnapshotState, AccountSnapshotLocalState } from "./types.js";
import { documentType, fileExtension } from "./constants.js";
import { CreateState, CreateExtendedState, CreateDocument, SaveToFile, SaveToFileHandle, LoadFromFile, LoadFromInput } from "document-model";
import { reducer } from "./reducer.js";

 
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

export const createState: CreateState<
  AccountSnapshotState,
  AccountSnapshotLocalState
> = (state) => {
  return {
    global: { ...initialGlobalState, ...state?.global },
    local: { ...initialLocalState, ...state?.local },
  };
};

export const createExtendedState: CreateExtendedState<
  AccountSnapshotState,
  AccountSnapshotLocalState
> = (extendedState) => {
  return baseCreateExtendedState(
    { ...extendedState, documentType },
    createState
  );
};

export const createDocument: CreateDocument<
  AccountSnapshotState,
  AccountSnapshotLocalState,
  AccountSnapshotAction
> = (state) => {
  return baseCreateDocument(createExtendedState(state), createState);
};

export const saveToFile: SaveToFile<
  AccountSnapshotState,
  AccountSnapshotLocalState,
  AccountSnapshotAction
> = (document, path, name) => {
  return baseSaveToFile(document, path, fileExtension, name);
};

export const saveToFileHandle: SaveToFileHandle<
  AccountSnapshotState,
  AccountSnapshotLocalState,
  AccountSnapshotAction
> = (document, input) => {
  return baseSaveToFileHandle(document, input);
};

export const loadFromFile: LoadFromFile<
  AccountSnapshotState,
  AccountSnapshotLocalState,
  AccountSnapshotAction
> = (path) => {
  return baseLoadFromFile(path, reducer);
};

export const loadFromInput: LoadFromInput<
  AccountSnapshotState,
  AccountSnapshotLocalState,
  AccountSnapshotAction
> = (input) => {
  return baseLoadFromInput(input, reducer);
};

export const utils = {
  fileExtension,
  createState,
  createExtendedState,
  createDocument,
  saveToFile,
  saveToFileHandle,
  loadFromFile,
  loadFromInput,
};


