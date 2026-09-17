/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { PHDocumentController } from "document-model";
import { ExpenseReport } from "../module.js";
import type { ExpenseReportAction, ExpenseReportPHState } from "./types.js";

export const ExpenseReportController = PHDocumentController.forDocumentModel<
  ExpenseReportPHState,
  ExpenseReportAction
>(ExpenseReport);
