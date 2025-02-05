import { SignalDispatch } from "document-model";
import {
  SetOwnerAction,
  SetMonthAction,
  SetFtesAction,
  SetQuoteCurrencyAction,
} from "./actions.js";
import { BudgetStatementAction, BudgetStatementLocalState, BudgetStatementState } from "../types.js";

export interface BudgetStatementBaseOperations {
  setOwnerOperation: (
    state: BudgetStatementState,
    action: SetOwnerAction,
    dispatch?: SignalDispatch<BudgetStatementState, BudgetStatementAction, BudgetStatementLocalState>,
  ) => void;
  setMonthOperation: (
    state: BudgetStatementState,
    action: SetMonthAction,
    dispatch?: SignalDispatch<BudgetStatementState, BudgetStatementAction, BudgetStatementLocalState>,
  ) => void;
  setFtesOperation: (
    state: BudgetStatementState,
    action: SetFtesAction,
    dispatch?: SignalDispatch<BudgetStatementState, BudgetStatementAction, BudgetStatementLocalState>,
  ) => void;
  setQuoteCurrencyOperation: (
    state: BudgetStatementState,
    action: SetQuoteCurrencyAction,
    dispatch?: SignalDispatch<BudgetStatementState, BudgetStatementAction, BudgetStatementLocalState>,
  ) => void;
}
