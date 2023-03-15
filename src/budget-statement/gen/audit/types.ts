import { Action } from '../../../document';
import { AuditReport, AuditReportInput } from '../../custom';

export const ADD_AUDIT_REPORT = 'ADD_AUDIT_REPORT';
export const DELETE_AUDIT_REPORT = 'DELETE_AUDIT_REPORT';
export const APPROVE_AUDIT_REPORT = 'APPROVE_AUDIT_REPORT';
export const SET_NEEDS_ACTION_AUDIT_REPORT = 'SET_NEEDS_ACTION_AUDIT_REPORT';
export const ESCALATE_AUDIT_REPORT = 'ESCALATE_AUDIT_REPORT';

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

export interface ApproveAuditReportAction extends Action {
    type: typeof APPROVE_AUDIT_REPORT;
    input: {
        reports: {
            report: AuditReport['report'];
            comment?: string | undefined;
        }[];
    };
}

export interface SetNeedsActionAuditReportAction extends Action {
    type: typeof SET_NEEDS_ACTION_AUDIT_REPORT;
    input: {
        reports: AuditReport['report'][];
    };
}

export interface EscalateAuditReportAction extends Action {
    type: typeof ESCALATE_AUDIT_REPORT;
    input: {
        reports: AuditReport['report'][];
    };
}

export type BudgetStatementAuditReportAction =
    | AddAuditReportAction
    | DeleteAuditReportAction
    | ApproveAuditReportAction
    | SetNeedsActionAuditReportAction
    | EscalateAuditReportAction;
