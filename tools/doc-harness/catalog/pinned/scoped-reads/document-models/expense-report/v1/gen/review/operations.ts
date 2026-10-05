/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { ExpenseReportLocalState } from "../types.js";
import type { AddReviewNoteAction } from "./actions.js";

export interface ExpenseReportReviewOperations {
  addReviewNoteOperation: (
    state: ExpenseReportLocalState,
    action: AddReviewNoteAction,
    dispatch?: SignalDispatch,
  ) => void;
}
