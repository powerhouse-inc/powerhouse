import { SignalDispatch } from "document-model";
import {
    AddLineItemAction,
    UpdateLineItemAction,
    DeleteLineItemAction,
    SortLineItemsAction,
} from "./actions.js";
import { BudgetStatementState } from "../types.js";

export interface BudgetStatementLineItemOperations {
  addLineItemOperation: (
    state: BudgetStatementState,
    action: AddLineItemAction,
    dispatch?: SignalDispatch,
  ) => void;
  updateLineItemOperation: (
    state: BudgetStatementState,
    action: UpdateLineItemAction,
    dispatch?: SignalDispatch,
  ) => void;
  deleteLineItemOperation: (
    state: BudgetStatementState,
    action: DeleteLineItemAction,
    dispatch?: SignalDispatch,
  ) => void;
  sortLineItemsOperation: (
    state: BudgetStatementState,
    action: SortLineItemsAction,
    dispatch?: SignalDispatch,
  ) => void;
}
