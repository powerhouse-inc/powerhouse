import { documentModelFileExtension } from "./gen/constants.js";
import * as actions from "./gen/creators.js";
import { documentModelState } from "./gen/document-model.js";
import { documentModelReducer } from "./gen/reducer.js";
import {
  documentModelCreateDocument,
  documentModelCreateState,
  documentModelLoadFromInput,
  documentModelSaveToFileHandle,
} from "./gen/utils.js";
import type { DocumentModelDocumentModelModule } from "./types.js";

const utils = {
  fileExtension: documentModelFileExtension,
  createState: documentModelCreateState,
  createDocument: documentModelCreateDocument,
  loadFromInput: documentModelLoadFromInput,
  saveToFileHandle: documentModelSaveToFileHandle,
};
export const documentModelDocumentModelModule: DocumentModelDocumentModelModule =
  {
    reducer: documentModelReducer,
    documentModel: documentModelState,
    actions,
    utils,
  };
