import * as customUtils from "./custom/custom-utils.js";
import * as actions from "./gen/actions.js";
import {
  documentModelName,
  documentType,
  fileExtension,
} from "./gen/constants.js";
import * as creators from "./gen/creators.js";
import * as documentModelUtils from "./gen/document-model-utils.js";
import { documentModelState } from "./gen/document-model.js";
import { reducer } from "./gen/reducer.js";
import { type DocumentModelDocumentModelModule } from "./types.js";

export const documentModelDocumentModelModule: DocumentModelDocumentModelModule =
  {
    documentModelName,
    documentType,
    fileExtension,
    reducer,
    documentModelState,
    actions: { ...creators, ...actions },
    utils: { ...documentModelUtils, ...customUtils },
  };
