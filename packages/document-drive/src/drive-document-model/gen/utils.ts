import {
  CreateDocument,
  CreateExtendedState,
  CreateState,
  LoadFromFile,
  LoadFromInput,
  SaveToFile,
  SaveToFileHandle,
  baseCreateDocument,
  baseCreateExtendedState,
  baseLoadFromFile,
  baseLoadFromInput,
  baseSaveToFile,
  baseSaveToFileHandle,
} from "document-model";
import {
  documentType,
  fileExtension,
  initialGlobalState,
  initialLocalState,
} from "./constants.js";
import {
  DocumentDriveAction,
  DocumentDriveLocalState,
  DocumentDriveState,
} from "./types.js";
import { reducer } from "./reducer.js";

export const createState: CreateState<
  DocumentDriveState,
  DocumentDriveLocalState
> = (state) => {
  return {
    global: { ...initialGlobalState, ...state?.global },
    local: { ...initialLocalState, ...state?.local },
  };
};

export const createExtendedState: CreateExtendedState<
  DocumentDriveState,
  DocumentDriveLocalState
> = (extendedState) => {
  return baseCreateExtendedState(
    { ...extendedState, documentType },
    createState
  );
};

export const createDocument: CreateDocument<
  DocumentDriveState,
  DocumentDriveLocalState,
  DocumentDriveAction
> = (state) => {
  return baseCreateDocument(createExtendedState(state), createState);
};

export const saveToFile: SaveToFile<
  DocumentDriveState,
  DocumentDriveLocalState,
  DocumentDriveAction
> = (document, path, name) => {
  return baseSaveToFile(document, path, fileExtension, name);
};

export const saveToFileHandle: SaveToFileHandle<
  DocumentDriveState,
  DocumentDriveLocalState,
  DocumentDriveAction
> = (document, input) => {
  return baseSaveToFileHandle(document, input);
};

export const loadFromFile: LoadFromFile<
  DocumentDriveState,
  DocumentDriveLocalState,
  DocumentDriveAction
> = (path) => {
  return baseLoadFromFile(path, reducer);
};

export const loadFromInput: LoadFromInput<
  DocumentDriveState,
  DocumentDriveLocalState,
  DocumentDriveAction
> = (input) => {
  return baseLoadFromInput(input, reducer);
};
