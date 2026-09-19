/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type { ApproveExpenseInput, SubmitExpenseInput } from "../types.js";

export type SubmitExpenseAction = Action & {
  type: "SUBMIT_EXPENSE";
  input: SubmitExpenseInput;
};
export type ApproveExpenseAction = Action & {
  type: "APPROVE_EXPENSE";
  input: ApproveExpenseInput;
};

export type ExpenseReportExpensesAction =
  | SubmitExpenseAction
  | ApproveExpenseAction;
