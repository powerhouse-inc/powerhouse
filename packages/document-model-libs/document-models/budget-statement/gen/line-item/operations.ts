import { SignalDispatch } from "document-model/document";
import {
  AddLineItemAction,
  UpdateLineItemAction,
  DeleteLineItemAction,
  SortLineItemsAction,
} from "./actions";
import { BudgetStatementState } from "../types";

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
