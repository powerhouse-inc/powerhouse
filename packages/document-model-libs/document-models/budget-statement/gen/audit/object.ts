
import { AttachmentInput, BaseDocument } from "document-model";
import { BudgetStatementAction } from "../actions.js";
import { AddAuditReportInput, DeleteAuditReportInput } from "../schema/types.js";
import { BudgetStatementState, BudgetStatementLocalState } from "../types.js";
import { addAuditReport, deleteAuditReport } from "./creators.js";

export default class BudgetStatement_Audit extends BaseDocument<
  BudgetStatementState,
  BudgetStatementAction,
  BudgetStatementLocalState
> {
  public addAuditReport(
    input: AddAuditReportInput,
    attachments: AttachmentInput[],
  ) {
    return this.dispatch(addAuditReport(input, attachments));
  }

  public deleteAuditReport(input: DeleteAuditReportInput) {
    return this.dispatch(deleteAuditReport(input));
  }
}
