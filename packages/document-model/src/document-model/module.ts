import type { DocumentModelDocumentModelModule } from "document-model";
import { documentModelReducer, documentModelState } from "document-model";
import * as customUtils from "./custom/utils.js";
import * as creators from "./gen/creators.js";
import * as documentModelUtils from "./gen/utils.js";

export const documentModelDocumentModelModule: DocumentModelDocumentModelModule =
  {
    reducer: documentModelReducer,
    documentModel: documentModelState,
    actions: { ...creators },
    utils: {
      ...documentModelUtils,
      ...customUtils,
      loadFromFile: documentModelUtils.documentModelLoadFromFile,
    },
  };
