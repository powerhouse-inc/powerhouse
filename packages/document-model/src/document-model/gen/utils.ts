import {
  CreateDocument,
  CreateExtendedState,
  CreateState,
  LoadFromFile,
  LoadFromInput,
  SaveToFile,
  SaveToFileHandle,
} from "#document/types.js";
import {
  baseCreateDocument,
  baseCreateExtendedState,
} from "#document/utils/base.js";
import {
  baseLoadFromFile,
  baseLoadFromInput,
  baseSaveToFile,
  baseSaveToFileHandle,
} from "#document/utils/file.js";
import {
  documentModelState,
  fileExtension,
  initialLocalState,
} from "./constants.js";
import { reducer } from "./reducer.js";
import { DocumentModelDocument } from "./types.js";

export { fileExtension } from "./constants.js";

export const createState: CreateState<DocumentModelDocument> = (state) => {
  return {
    document: { ...documentModelState, ...state?.document },
    global: { ...documentModelState, ...state?.global },
    local: { ...initialLocalState, ...state?.local },
  };
};

export const createExtendedState: CreateExtendedState<DocumentModelDocument> = (
  extendedState,
) => {
  return baseCreateExtendedState({ ...extendedState }, createState);
};

export const createDocument: CreateDocument<DocumentModelDocument> = (
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

export const loadFromFile: LoadFromFile<DocumentModelDocument> = (path) => {
  return baseLoadFromFile(path, reducer);
};

export const loadFromInput: LoadFromInput<DocumentModelDocument> = (input) => {
  return baseLoadFromInput(input, reducer);
};
