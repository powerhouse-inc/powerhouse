import {
  actions,
  createState,
  defaultBaseState,
  documentModelFileExtension,
  documentModelGlobalState,
  documentModelReducer,
} from "@powerhousedao/shared/document-model";
import {
  documentModelLoadFromInput,
  documentModelSaveToFileHandle,
} from "./files.js";
import {
  assertIsDocumentOfType,
  assertIsStateOfType,
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
