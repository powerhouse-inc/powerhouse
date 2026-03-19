import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import {
  createState,
  defaultBaseState,
} from "@powerhousedao/shared/document-model";
import type { BillingStatementPHState } from "test/document-models/billing-statement/v1";
import {
  actions,
  documentModel,
  reducer,
  utils,
} from "test/document-models/billing-statement/v1";

/** Document model module for the Todo List document type */
export const BillingStatement: DocumentModelModule<BillingStatementPHState> = {
  reducer,
  actions,
  utils,
  documentModel: createState(defaultBaseState(), documentModel),
};
