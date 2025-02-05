import { BaseDocument, AttachmentInput } from "document-model/document";
import {
  AddAuditReportInput,
  DeleteAuditReportInput,
  BudgetStatementState,
  BudgetStatementLocalState,
} from "../types";
import { addAuditReport, deleteAuditReport } from "./creators";
import { BudgetStatementAction } from "../actions";

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
