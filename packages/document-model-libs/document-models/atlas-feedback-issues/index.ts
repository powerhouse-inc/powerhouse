/**
 * This is a scaffold file meant for customization.
 * Delete the file and run the code generator again to have it reset
 */

import { actions as BaseActions, DocumentModel } from "document-model/document";
import {
  actions as AtlasFeedbackIssuesActions,
  AtlasFeedbackIssues,
} from "./gen";
import { reducer } from "./gen/reducer";
import { documentModel } from "./gen/document-model";
import genUtils from "./gen/utils";
import * as customUtils from "./src/utils";
import {
  AtlasFeedbackIssuesState,
  AtlasFeedbackIssuesAction,
  AtlasFeedbackIssuesLocalState,
} from "./gen/types";

const Document = AtlasFeedbackIssues;
const utils = { ...genUtils, ...customUtils };
const actions = { ...BaseActions, ...AtlasFeedbackIssuesActions };

export const module: DocumentModel<
  AtlasFeedbackIssuesState,
  AtlasFeedbackIssuesAction,
  AtlasFeedbackIssuesLocalState
> = {
  Document,
  reducer,
  actions,
  utils,
  documentModel,
};

export {
  AtlasFeedbackIssues,
  Document,
  reducer,
  actions,
  utils,
  documentModel,
};

export * from "./gen/types";
export * from "./src/utils";
