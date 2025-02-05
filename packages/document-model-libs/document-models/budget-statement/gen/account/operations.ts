import type { SignalDispatch } from "document-model";
import {
  AddAccountAction,
  UpdateAccountAction,
  DeleteAccountAction,
  SortAccountsAction,
} from "./actions.js";
import { BudgetStatementAction, BudgetStatementLocalState, BudgetStatementState } from "../types.js";

export interface BudgetStatementAccountOperations {
  addAccountOperation: (
    state: BudgetStatementState,
    action: AddAccountAction,
    dispatch?: SignalDispatch<BudgetStatementState, BudgetStatementLocalState, BudgetStatementAction>,
  ) => void;
  updateAccountOperation: (
    state: BudgetStatementState,
    action: UpdateAccountAction,
    dispatch?: SignalDispatch<BudgetStatementState, BudgetStatementLocalState, BudgetStatementAction>,
  ) => void;
  deleteAccountOperation: (
    state: BudgetStatementState,
    action: DeleteAccountAction,
    dispatch?: SignalDispatch<BudgetStatementState, BudgetStatementLocalState, BudgetStatementAction>,
  ) => void;
  sortAccountsOperation: (
    state: BudgetStatementState,
    action: SortAccountsAction,
    dispatch?: SignalDispatch<BudgetStatementState, BudgetStatementLocalState, BudgetStatementAction>,
  ) => void;
}
