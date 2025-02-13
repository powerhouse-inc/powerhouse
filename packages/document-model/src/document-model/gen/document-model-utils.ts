import {
  DocumentModelLocalState,
  DocumentModelState
} from "./types.js";

import {
  CreateDocument,
  CreateExtendedState,
  CreateState,
  LoadFromFile,
  LoadFromInput,
  SaveToFile,
  SaveToFileHandle,
} from "../../document/types.js";
import {
  baseCreateDocument,
  baseCreateExtendedState,
} from "../../document/utils/base.js";
import {
  baseLoadFromFile,
  baseLoadFromInput,
  baseSaveToFile,
  baseSaveToFileHandle,
} from "../../document/utils/file.js";
import {
  documentModelState,
  documentType,
  fileExtension,
  initialLocalState,
} from "./constants.js";
import { reducer } from "./reducer.js";

export const createState: CreateState<
  DocumentModelState,
  DocumentModelLocalState
> = (state) => {
  return {
    global: { ...documentModelState, ...state?.global },
    local: { ...initialLocalState, ...state?.local },
  };
};

export const createExtendedState: CreateExtendedState<
  DocumentModelState,
  DocumentModelLocalState
> = (extendedState) => {
  return baseCreateExtendedState(
    { ...extendedState, documentType },
    createState
  );
};

export const createDocument: CreateDocument<
  DocumentModelState,
  DocumentModelLocalState
> = (state) => {
  return baseCreateDocument(createExtendedState(state), createState);
};

export const saveToFile: SaveToFile = (document, path, name) => {
  return baseSaveToFile(document, path, fileExtension, name);
};

export const saveToFileHandle: SaveToFileHandle = (document, input) => {
  return baseSaveToFileHandle(document, input);
};

export const loadFromFile: LoadFromFile<
  DocumentModelState,
  DocumentModelLocalState
> = (path) => {
  return baseLoadFromFile(path, reducer);
};

export const loadFromInput: LoadFromInput<
  DocumentModelState,
  DocumentModelLocalState
> = (input) => {
  return baseLoadFromInput(input, reducer);
};
