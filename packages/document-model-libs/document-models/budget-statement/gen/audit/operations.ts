import { SignalDispatch } from "document-model";
import { BudgetStatementAction, BudgetStatementLocalState, BudgetStatementState } from "../types.js";
import { AddAuditReportAction, DeleteAuditReportAction } from "./actions.js";


export interface BudgetStatementAuditOperations {
  addAuditReportOperation: (
    state: BudgetStatementState,
    action: AddAuditReportAction,
    dispatch?: SignalDispatch<BudgetStatementState, BudgetStatementAction, BudgetStatementLocalState>,
  ) => void;
  deleteAuditReportOperation: (
    state: BudgetStatementState,
    action: DeleteAuditReportAction,
    dispatch?: SignalDispatch<BudgetStatementState, BudgetStatementAction, BudgetStatementLocalState>,
  ) => void;
}
