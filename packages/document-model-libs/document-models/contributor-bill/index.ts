/**
 * This is a scaffold file meant for customization.
 * Delete the file and run the code generator again to have it reset
 */

import { actions as BaseActions, DocumentModel } from "document-model/document";
import { actions as ContributorBillActions, ContributorBill } from "./gen";
import { reducer } from "./gen/reducer";
import { documentModel } from "./gen/document-model";
import genUtils from "./gen/utils";
import * as customUtils from "./src/utils";
import {
  ContributorBillState,
  ContributorBillAction,
  ContributorBillLocalState,
} from "./gen/types";

const Document = ContributorBill;
const utils = { ...genUtils, ...customUtils };
const actions = { ...BaseActions, ...ContributorBillActions };

export const module: DocumentModel<
  ContributorBillState,
  ContributorBillAction,
  ContributorBillLocalState
> = {
  Document,
  reducer,
  actions,
  utils,
  documentModel,
};

export { ContributorBill, Document, reducer, actions, utils, documentModel };

export * from "./gen/types";
export * from "./src/utils";
