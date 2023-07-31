import type {
    AddAuditReportAction,
    DeleteAuditReportAction,
} from '@acaldas/document-model-graphql/budget-statement';

export const ADD_AUDIT_REPORT = 'ADD_AUDIT_REPORT';
export const DELETE_AUDIT_REPORT = 'DELETE_AUDIT_REPORT';

export { AddAuditReportAction, DeleteAuditReportAction };

export type BudgetStatementAuditReportAction =
    | AddAuditReportAction
    | DeleteAuditReportAction;
