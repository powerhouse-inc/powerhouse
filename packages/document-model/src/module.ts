import type { DocumentModelDocumentModelModule } from "@powerhousedao/shared/document-model";
import {
  actions,
  createState,
  defaultBaseState,
  documentModelFileExtension,
  documentModelGlobalState,
  documentModelLoadFromInput,
  documentModelReducer,
  documentModelSaveToFileHandle,
} from "@powerhousedao/shared/document-model";
import {
  assertIsDocumentOfType,
  assertIsStateOfType,
  documentModelCreateDocument,
  documentModelCreateState,
  isDocumentOfType,
  isStateOfType,
} from "./state.js";

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
