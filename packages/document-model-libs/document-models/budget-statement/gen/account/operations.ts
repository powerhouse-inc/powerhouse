import { SignalDispatch } from "document-model/document";
import {
  AddAccountAction,
  UpdateAccountAction,
  DeleteAccountAction,
  SortAccountsAction,
} from "./actions";
import { BudgetStatementState } from "../types";

export interface BudgetStatementAccountOperations {
  addAccountOperation: (
    state: BudgetStatementState,
    action: AddAccountAction,
    dispatch?: SignalDispatch,
  ) => void;
  updateAccountOperation: (
    state: BudgetStatementState,
    action: UpdateAccountAction,
    dispatch?: SignalDispatch,
  ) => void;
  deleteAccountOperation: (
    state: BudgetStatementState,
    action: DeleteAccountAction,
    dispatch?: SignalDispatch,
  ) => void;
  sortAccountsOperation: (
    state: BudgetStatementState,
    action: SortAccountsAction,
    dispatch?: SignalDispatch,
  ) => void;
}
