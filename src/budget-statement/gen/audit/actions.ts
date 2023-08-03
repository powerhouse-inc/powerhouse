import { Action, ActionWithAttachment } from '../../../document';

import {
    AddAuditReportInput,
    DeleteAuditReportInput,
} from '@acaldas/document-model-graphql/budget-statement';

export type AddAuditReportAction = ActionWithAttachment<'ADD_AUDIT_REPORT', AddAuditReportInput>;
export type DeleteAuditReportAction = Action<'DELETE_AUDIT_REPORT', DeleteAuditReportInput>;

export type BudgetStatementAuditAction = 
    | AddAuditReportAction
    | DeleteAuditReportAction
;