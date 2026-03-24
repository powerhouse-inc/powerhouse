import { type SignalDispatch } from "document-model";
import { type BillingStatementState } from "../types.js";
import { type EditLineItemTagAction } from "./actions.js";

export interface BillingStatementTagsOperations {
  editLineItemTagOperation: (
    state: BillingStatementState,
    action: EditLineItemTagAction,
    dispatch?: SignalDispatch,
  ) => void;
}
