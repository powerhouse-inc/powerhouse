import { Action, ActionWithAttachment } from "document-model/document";
import { AddAuditReportInput, DeleteAuditReportInput } from "../types";

export type AddAuditReportAction = ActionWithAttachment<
  "ADD_AUDIT_REPORT",
  AddAuditReportInput,
  "global"
>;
export type DeleteAuditReportAction = Action<
  "DELETE_AUDIT_REPORT",
  DeleteAuditReportInput,
  "global"
>;

export type BudgetStatementAuditAction =
  | AddAuditReportAction
  | DeleteAuditReportAction;
