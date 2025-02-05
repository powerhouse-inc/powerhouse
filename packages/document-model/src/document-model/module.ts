import { type DocumentModelModule } from "./types.js";
import * as creators from "./gen/creators.js";
import * as actions from "./gen/actions.js";
import { documentModelState } from "./gen/document-model.js";
import { reducer } from "./gen/reducer.js";
import {
  DocumentModelAction,
  DocumentModelLocalState,
  DocumentModelState,
} from "./gen/types.js";
import * as customUtils from "./custom/custom-utils.js";
import * as documentModelUtils from "./gen/document-model-utils.js";
import { fileExtension } from "./gen/constants.js";

export const module: DocumentModelModule<
  DocumentModelState,
  DocumentModelLocalState,
  DocumentModelAction
> = {
  reducer,
  documentModelState,
  actions: { ...creators, ...actions },
  utils: { ...documentModelUtils, ...customUtils, fileExtension },
};
