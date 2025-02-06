import { SignalDispatch } from "document-model/document";
import {
  AddCommentAction,
  UpdateCommentAction,
  DeleteCommentAction,
} from "./actions";
import { BudgetStatementState } from "../types";

export interface BudgetStatementCommentOperations {
  addCommentOperation: (
    state: BudgetStatementState,
    action: AddCommentAction,
    dispatch?: SignalDispatch,
  ) => void;
  updateCommentOperation: (
    state: BudgetStatementState,
    action: UpdateCommentAction,
    dispatch?: SignalDispatch,
  ) => void;
  deleteCommentOperation: (
    state: BudgetStatementState,
    action: DeleteCommentAction,
    dispatch?: SignalDispatch,
  ) => void;
}
