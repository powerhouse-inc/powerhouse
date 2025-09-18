/**
 * This is a scaffold file meant for customization.
 * Delete the file and run the code generator again to have it reset
 */

import {
  actions as BaseActions,
  createState,
  defaultBaseState,
  type DocumentModelModule,
} from "document-model";
import { documentModel } from "./gen/document-model.js";
import { actions as DocumentEditorActions } from "./gen/index.js";
import { reducer } from "./gen/reducer.js";
import type { DocumentEditorPHState } from "./gen/types.js";
import genUtils from "./gen/utils.js";
import * as customUtils from "./src/utils.js";

const utils = { ...genUtils, ...customUtils };
const actions = { ...BaseActions, ...DocumentEditorActions };

export const module: DocumentModelModule<DocumentEditorPHState> = {
  reducer,
  actions,
  utils,
  documentModel: createState(defaultBaseState(), documentModel),
};

export { actions, documentModel, reducer, utils };

export * from "./gen/types.js";
export * from "./src/utils.js";
