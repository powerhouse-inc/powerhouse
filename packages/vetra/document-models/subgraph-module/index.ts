/**
 * This is a scaffold file meant for customization.
 * Delete the file and run the code generator again to have it reset
 */

import type { DocumentModelModule } from "document-model";
import { actions as BaseActions } from "document-model";
import { actions as SubgraphModuleActions } from "./gen/index.js";
import { reducer } from "./gen/reducer.js";
import { documentModel } from "./gen/document-model.js";
import genUtils from "./gen/utils.js";
import * as customUtils from "./src/utils.js";
import type { SubgraphModulePHState } from "./gen/ph-factories.js";

const utils = { ...genUtils, ...customUtils };
const actions = { ...BaseActions, ...SubgraphModuleActions };

export const module: DocumentModelModule<SubgraphModulePHState> = {
  reducer,
  actions,
  utils,
  documentModel,
};

export { reducer, actions, utils, documentModel };

export * from "./gen/types.js";
export * from "./src/utils.js";
