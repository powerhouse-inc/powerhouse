import { defaultBaseState } from "#document/ph-factories.js";
import {
  CreateDocument,
  CreateState,
  LoadFromFile,
  LoadFromInput,
  SaveToFile,
  SaveToFileHandle,
} from "#document/types.js";
import { baseCreateDocument } from "#document/utils/base.js";
import {
  baseLoadFromFile,
  baseLoadFromInput,
  baseSaveToFile,
  baseSaveToFileHandle,
} from "#document/utils/file.js";
import {
  documentModelState,
  documentType,
  fileExtension,
  initialLocalState,
} from "./constants.js";
import { DocumentModelPHState } from "./ph-factories.js";
import { reducer } from "./reducer.js";

export { fileExtension } from "./constants.js";

export const createState: CreateState<DocumentModelPHState> = (state) => {
  return {
    ...defaultBaseState(),
    global: { ...documentModelState, ...(state?.global ?? {}) },
    local: { ...initialLocalState, ...(state?.local ?? {}) },
  };
};

export const createDocument: CreateDocument<DocumentModelPHState> = (state) => {
  const document = baseCreateDocument(createState, state);
  document.header.documentType = documentType;

  return document;
};

export const saveToFile: SaveToFile = (document, path, name) => {
  return baseSaveToFile(document, path, fileExtension, name);
};

export const saveToFileHandle: SaveToFileHandle = (document, input) => {
  return baseSaveToFileHandle(document, input);
};

export const loadFromFile: LoadFromFile<DocumentModelPHState> = (path) => {
  return baseLoadFromFile(path, reducer);
};

export const loadFromInput: LoadFromInput<DocumentModelPHState> = (input) => {
  return baseLoadFromInput(input, reducer);
};
