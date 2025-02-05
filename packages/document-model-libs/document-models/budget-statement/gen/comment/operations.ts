import { SignalDispatch } from "document-model";
import {
  AddCommentAction,
  UpdateCommentAction,
  DeleteCommentAction,
} from "./actions.js";
import { BudgetStatementAction, BudgetStatementLocalState, BudgetStatementState } from "../types.js";

export interface BudgetStatementCommentOperations {
  addCommentOperation: (
    state: BudgetStatementState,
    action: AddCommentAction,
    dispatch?: SignalDispatch<BudgetStatementState, BudgetStatementAction, BudgetStatementLocalState>,
  ) => void;
  updateCommentOperation: (
    state: BudgetStatementState,
    action: UpdateCommentAction,
    dispatch?: SignalDispatch<BudgetStatementState, BudgetStatementAction, BudgetStatementLocalState>,
  ) => void;
  deleteCommentOperation: (
    state: BudgetStatementState,
    action: DeleteCommentAction,
    dispatch?: SignalDispatch<BudgetStatementState, BudgetStatementAction, BudgetStatementLocalState>,
  ) => void;
}
