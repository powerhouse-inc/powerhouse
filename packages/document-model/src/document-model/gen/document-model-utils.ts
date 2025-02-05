import {
  DocumentModelAction,
  DocumentModelLocalState,
  DocumentModelState,
} from "./types.js";

import { reducer } from "./reducer.js";
import {
  CreateDocument,
  CreateExtendedState,
  CreateState,
  LoadFromFile,
  LoadFromInput,
  SaveToFile,
  SaveToFileHandle,
} from "@document/types.js";
import {
  baseCreateExtendedState,
  baseCreateDocument,
} from "@document/utils/base.js";
import {
  baseSaveToFile,
  baseSaveToFileHandle,
  baseLoadFromFile,
  baseLoadFromInput,
} from "@document/utils/file.js";
import {
  documentType,
  fileExtension,
  initialGlobalState,
  initialLocalState,
} from "./constants.js";

export const createState: CreateState<
  DocumentModelState,
  DocumentModelLocalState
> = (state) => {
  return {
    global: { ...initialGlobalState, ...state?.global },
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
  DocumentModelLocalState,
  DocumentModelAction
> = (state) => {
  return baseCreateDocument(createExtendedState(state), createState);
};

export const saveToFile: SaveToFile<
  DocumentModelState,
  DocumentModelLocalState,
  DocumentModelAction
> = (document, path, name) => {
  return baseSaveToFile(document, path, fileExtension, name);
};

export const saveToFileHandle: SaveToFileHandle<
  DocumentModelState,
  DocumentModelLocalState,
  DocumentModelAction
> = (document, input) => {
  return baseSaveToFileHandle(document, input);
};

export const loadFromFile: LoadFromFile<
  DocumentModelState,
  DocumentModelLocalState,
  DocumentModelAction
> = (path) => {
  return baseLoadFromFile(path, reducer);
};

export const loadFromInput: LoadFromInput<
  DocumentModelState,
  DocumentModelLocalState,
  DocumentModelAction
> = (input) => {
  return baseLoadFromInput(input, reducer);
};
