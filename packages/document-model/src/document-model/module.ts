import { defaultBaseState } from "../document/ph-factories.js";
import { documentModelFileExtension } from "./gen/constants.js";
import * as actions from "./gen/creators.js";
import { documentModelState } from "./gen/document-model.js";
import { createState } from "./gen/ph-factories.js";
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
    documentModel: createState(defaultBaseState(), documentModelState),
    actions,
    utils,
  };
