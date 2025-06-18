import {
  actions as BaseActions,
  type DocumentModelModule,
} from "document-model";
import { documentModel } from "./gen/document-model.js";
import { actions as DocumentDriveActions } from "./gen/index.js";
import { reducer } from "./gen/reducer.js";
import { type DocumentDriveDocument } from "./gen/types.js";
import genUtils, { type DocumentDriveUtils } from "./gen/utils.js";
import * as customUtils from "./src/utils.js";

const utils = { ...genUtils, ...customUtils } satisfies DocumentDriveUtils;

const actions = { ...BaseActions, ...DocumentDriveActions };

export const module: DocumentModelModule<DocumentDriveDocument> = {
  reducer,
  actions,
  utils,
  documentModel,
};

export const driveDocumentModelModule = module;

export { actions, documentModel, reducer };

export * from "./gen/types.js";
export * from "./src/utils.js";
