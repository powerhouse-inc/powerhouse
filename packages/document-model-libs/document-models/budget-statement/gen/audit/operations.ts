import { SignalDispatch } from "document-model/document";
import { AddAuditReportAction, DeleteAuditReportAction } from "./actions";
import { BudgetStatementState } from "../types";

export interface BudgetStatementAuditOperations {
  addAuditReportOperation: (
    state: BudgetStatementState,
    action: AddAuditReportAction,
    dispatch?: SignalDispatch,
  ) => void;
  deleteAuditReportOperation: (
    state: BudgetStatementState,
    action: DeleteAuditReportAction,
    dispatch?: SignalDispatch,
  ) => void;
}
