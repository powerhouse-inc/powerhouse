import { SignalDispatch } from "document-model/document";
import {
  SetOwnerAction,
  SetMonthAction,
  SetFtesAction,
  SetQuoteCurrencyAction,
} from "./actions";
import { BudgetStatementState } from "../types";

export interface BudgetStatementBaseOperations {
  setOwnerOperation: (
    state: BudgetStatementState,
    action: SetOwnerAction,
    dispatch?: SignalDispatch,
  ) => void;
  setMonthOperation: (
    state: BudgetStatementState,
    action: SetMonthAction,
    dispatch?: SignalDispatch,
  ) => void;
  setFtesOperation: (
    state: BudgetStatementState,
    action: SetFtesAction,
    dispatch?: SignalDispatch,
  ) => void;
  setQuoteCurrencyOperation: (
    state: BudgetStatementState,
    action: SetQuoteCurrencyAction,
    dispatch?: SignalDispatch,
  ) => void;
}
