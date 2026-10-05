/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { ExpenseReportGlobalState } from "../types.js";
import type { ApproveExpenseAction, SubmitExpenseAction } from "./actions.js";

export interface ExpenseReportExpensesOperations {
  submitExpenseOperation: (
    state: ExpenseReportGlobalState,
    action: SubmitExpenseAction,
    dispatch?: SignalDispatch,
  ) => void;
  approveExpenseOperation: (
    state: ExpenseReportGlobalState,
    action: ApproveExpenseAction,
    dispatch?: SignalDispatch,
  ) => void;
}
