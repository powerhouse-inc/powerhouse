import { BaseDocument } from '../../../document/object';
import { AttachmentInput } from '../../../document';

import {
    AddAuditReportInput,
    DeleteAuditReportInput,
} from '@acaldas/document-model-graphql/budget-statement';

import {
    addAuditReport,
    deleteAuditReport,
} from './creators';

import { BudgetStatementAction } from '../actions';
import { BudgetStatementState } from '@acaldas/document-model-graphql/budget-statement';

export default class BudgetStatement_Audit extends BaseDocument<
    BudgetStatementState, BudgetStatementAction
> {
    public addAuditReport(input: AddAuditReportInput, attachments: AttachmentInput[] ) {
        return this.dispatch(addAuditReport(input, attachments));
    }
    
    public deleteAuditReport(input: DeleteAuditReportInput) {
        return this.dispatch(deleteAuditReport(input));
    }
    
}