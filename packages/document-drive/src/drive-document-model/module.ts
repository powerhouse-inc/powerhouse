import * as actions from "./gen/actions.js";
import {
  documentModelName,
  documentType,
  fileExtension,
} from "./gen/constants.js";
import * as creators from "./gen/creators.js";
import { documentModelState } from "./gen/document-model.js";
import { reducer } from "./gen/reducer.js";
import { DriveDocumentModelModule } from "./gen/types.js";
import * as documentModelUtils from "./gen/utils.js";
import * as customUtils from "./src/utils.js";

export const module: DriveDocumentModelModule = {
  documentModelName,
  documentType,
  fileExtension,
  reducer,
  documentModelState,
  actions: { ...creators, ...actions },
  utils: { ...documentModelUtils, ...customUtils },
};
