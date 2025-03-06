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
import { reducer } from "./reducer.js";
import { DocumentDriveDocument } from "./types.js";

export { fileExtension } from "./constants.js";

export const createState: CreateState<DocumentDriveDocument> = (state) => {
  return {
    global: { ...initialGlobalState, ...state?.global },
    local: { ...initialLocalState, ...state?.local },
  };
};

export const createExtendedState: CreateExtendedState<DocumentDriveDocument> = (
  extendedState,
) => {
  return baseCreateExtendedState(
    { ...extendedState, documentType },
    createState,
  );
};

export const createDocument: CreateDocument<DocumentDriveDocument> = (
  state,
) => {
  return baseCreateDocument(createExtendedState(state), createState);
};

export const saveToFile: SaveToFile = (document, path, name) => {
  return baseSaveToFile(document, path, fileExtension, name);
};

export const saveToFileHandle: SaveToFileHandle = (document, input) => {
  return baseSaveToFileHandle(document, input);
};

export const loadFromFile: LoadFromFile<DocumentDriveDocument> = (path) => {
  return baseLoadFromFile(path, reducer);
};

export const loadFromInput: LoadFromInput<DocumentDriveDocument> = (input) => {
  return baseLoadFromInput(input, reducer);
};
