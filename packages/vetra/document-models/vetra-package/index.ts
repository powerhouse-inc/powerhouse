/**
 * This is a scaffold file meant for customization.
 * Delete the file and run the code generator again to have it reset
 */

import type { DocumentModelModule } from "document-model";
import { createState } from "document-model";
import { actions as BaseActions, defaultBaseState } from "document-model/core";
import { documentModel } from "./gen/document-model.js";
import { actions as VetraPackageActions } from "./gen/index.js";
import { reducer } from "./gen/reducer.js";
import type { VetraPackagePHState } from "./gen/types.js";
import genUtils from "./gen/utils.js";
import * as customUtils from "./src/utils.js";

const utils = { ...genUtils, ...customUtils };
const actions = { ...BaseActions, ...VetraPackageActions };

export const module: DocumentModelModule<VetraPackagePHState> = {
  reducer,
  actions,
  utils,
  documentModel: createState(defaultBaseState(), documentModel),
};

export { actions, documentModel, reducer, utils };

export * from "./gen/types.js";
export * from "./src/utils.js";
