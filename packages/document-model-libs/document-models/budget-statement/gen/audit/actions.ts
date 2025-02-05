import { BaseAction, BaseActionWithAttachment } from "document-model";
import { AddAuditReportInput, DeleteAuditReportInput } from "../schema/types.js";


export type AddAuditReportAction = BaseActionWithAttachment<
  "ADD_AUDIT_REPORT",
  AddAuditReportInput,
  "global"
>;
export type DeleteAuditReportAction = BaseAction<
  "DELETE_AUDIT_REPORT",
  DeleteAuditReportInput,
  "global"
>;

export type BudgetStatementAuditAction =
  | AddAuditReportAction
  | DeleteAuditReportAction;
