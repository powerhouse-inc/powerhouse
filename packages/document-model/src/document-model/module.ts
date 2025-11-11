import { defaultBaseState } from "document-model/core";
import { actions } from "./actions.js";
import {
  documentModelFileExtension,
  documentModelGlobalState,
} from "./constants.js";
import {
  documentModelLoadFromInput,
  documentModelSaveToFileHandle,
} from "./files.js";
import { documentModelReducer } from "./reducers.js";
import {
  assertIsDocumentOfType,
  assertIsStateOfType,
  createState,
  documentModelCreateDocument,
  documentModelCreateState,
  isDocumentOfType,
  isStateOfType,
} from "./state.js";
import type { DocumentModelDocumentModelModule } from "./types.js";

const utils = {
  fileExtension: documentModelFileExtension,
  createState: documentModelCreateState,
  createDocument: documentModelCreateDocument,
  loadFromInput: documentModelLoadFromInput,
  saveToFileHandle: documentModelSaveToFileHandle,
  isStateOfType,
  assertIsStateOfType,
  isDocumentOfType,
  assertIsDocumentOfType,
};

export const documentModelDocumentModelModule: DocumentModelDocumentModelModule =
  {
    reducer: documentModelReducer,
    documentModel: createState(defaultBaseState(), documentModelGlobalState),
    actions,
    utils,
  };
