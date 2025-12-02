import { type SignalDispatch } from "document-model";
import { type EditLineItemTagAction } from "./actions.js";
import { type BillingStatementState } from "../types.js";

export interface BillingStatementTagsOperations {
  editLineItemTagOperation: (
    state: BillingStatementState,
    action: EditLineItemTagAction,
    dispatch?: SignalDispatch,
  ) => void;
}
