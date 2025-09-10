import * as customUtils from "./custom/utils.js";
import * as actions from "./gen/actions.js";
import * as creators from "./gen/creators.js";
import { documentModelState } from "./gen/document-model.js";
import { reducer } from "./gen/reducer.js";
import * as documentModelUtils from "./gen/utils.js";
import type { DocumentModelDocumentModelModule } from "./types.js";

export const documentModelDocumentModelModule: DocumentModelDocumentModelModule =
  {
    reducer,
    documentModel: documentModelState,
    actions: { ...creators, ...actions },
    utils: { ...documentModelUtils, ...customUtils },
  };
