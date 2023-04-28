import {
    AddAuditReportAction,
    DeleteAuditReportAction,
} from 'document-model-graphql/budget-statement';
import { AuditReport, AuditReportInput } from '../../custom';

export const ADD_AUDIT_REPORT = 'ADD_AUDIT_REPORT';
export const DELETE_AUDIT_REPORT = 'DELETE_AUDIT_REPORT';

export { AddAuditReportAction, DeleteAuditReportAction };

export function isAuditReport(
    audit: AuditReportInput | AuditReport
): audit is AuditReport {
    return (
        typeof audit.report === 'string' &&
        audit.report.startsWith('attachment://')
    );
}

export type BudgetStatementAuditReportAction =
    | AddAuditReportAction
    | DeleteAuditReportAction;
