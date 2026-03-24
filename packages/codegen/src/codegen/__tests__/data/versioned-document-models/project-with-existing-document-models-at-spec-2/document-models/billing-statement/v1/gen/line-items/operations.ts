import { type SignalDispatch } from "document-model";
import type { BillingStatementState } from "../types.js";
import type { AddLineItemAction, EditLineItemAction } from "./actions.js";

export interface BillingStatementLineItemsOperations {
  addLineItemOperation: (
    state: BillingStatementState,
    action: AddLineItemAction,
    dispatch?: SignalDispatch,
  ) => void;
  editLineItemOperation: (
    state: BillingStatementState,
    action: EditLineItemAction,
    dispatch?: SignalDispatch,
  ) => void;
}
