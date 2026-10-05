/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { ExpenseReportExpensesAction } from "./expenses/actions.js";
import type { ExpenseReportReviewAction } from "./review/actions.js";

export * from "./expenses/actions.js";
export * from "./review/actions.js";

export type ExpenseReportAction =
  | ExpenseReportExpensesAction
  | ExpenseReportReviewAction;
