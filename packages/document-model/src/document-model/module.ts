import { actions as BaseActions } from "../document/actions/creators.js";
import * as customUtils from "./custom/utils.js";
import * as DocumentModelActions from "./gen/creators.js";
import { documentModelState } from "./gen/document-model.js";
import { reducer } from "./gen/reducer.js";
import * as documentModelUtils from "./gen/utils.js";
import type { DocumentModelDocumentModelModule } from "./types.js";

const actions = { ...BaseActions, ...DocumentModelActions };
export { actions, reducer };

export const documentModelDocumentModelModule: DocumentModelDocumentModelModule = {
  reducer,
  documentModel: documentModelState,
  actions,
  utils: { ...documentModelUtils, ...customUtils },
};
