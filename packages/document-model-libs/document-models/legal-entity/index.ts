/**
 * This is a scaffold file meant for customization.
 * Delete the file and run the code generator again to have it reset
 */

import { actions as BaseActions, DocumentModel } from "document-model/document";
import { actions as LegalEntityActions, LegalEntity } from "./gen";
import { reducer } from "./gen/reducer";
import { documentModel } from "./gen/document-model";
import genUtils from "./gen/utils";
import * as customUtils from "./src/utils";
import {
  LegalEntityState,
  LegalEntityAction,
  LegalEntityLocalState,
} from "./gen/types";

const Document = LegalEntity;
const utils = { ...genUtils, ...customUtils };
const actions = { ...BaseActions, ...LegalEntityActions };

export const module: DocumentModel<
  LegalEntityState,
  LegalEntityAction,
  LegalEntityLocalState
> = {
  Document,
  reducer,
  actions,
  utils,
  documentModel,
};

export { LegalEntity, Document, reducer, actions, utils, documentModel };

export * from "./gen/types";
export * from "./src/utils";
