import { Action } from '../../../document';
import { AuditReport, AuditReportInput } from '../../custom';

export const ADD_AUDIT_REPORT = 'ADD_AUDIT_REPORT';
export const DELETE_AUDIT_REPORT = 'DELETE_AUDIT_REPORT';

export interface AddAuditReportAction extends Action {
    type: typeof ADD_AUDIT_REPORT;
    input: {
        reports: AuditReportInput[];
    };
}

export interface DeleteAuditReportAction extends Action {
    type: typeof DELETE_AUDIT_REPORT;
    input: {
        reports: AuditReport['report'][];
    };
}

export type BudgetStatementAuditReportAction =
    | AddAuditReportAction
    | DeleteAuditReportAction;
