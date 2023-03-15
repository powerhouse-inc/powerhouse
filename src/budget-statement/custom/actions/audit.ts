import {
    AddAuditReportAction,
    ApproveAuditReportAction,
    DeleteAuditReportAction,
    EscalateAuditReportAction,
    SetNeedsActionAuditReportAction,
} from '../../gen/audit';
import { BudgetStatement } from '../types';

export const addAuditReportOperation = (
    state: BudgetStatement,
    action: AddAuditReportAction
) => {
    const newTimestamp = new Date();
    const newReports = action.input.reports.map(
        ({ timestamp, report, status }) => ({
            report,
            timestamp: timestamp ?? newTimestamp.toISOString(),
            status,
        })
    );
    state.data.auditReports.push(...newReports);
};

export const deleteAuditReportOperation = (
    state: BudgetStatement,
    action: DeleteAuditReportAction
) => {
    action.input.reports.forEach(report => {
        const index = state.data.auditReports.findIndex(
            audit => audit.report === report
        );
        if (index > -1) {
            state.data.auditReports.splice(index, 1);
        }
    });
};

export const approveAuditReportOperation = (
    state: BudgetStatement,
    action: ApproveAuditReportAction
) => {
    action.input.reports.forEach(auditToApprove => {
        const audit = state.data.auditReports.find(
            audit => audit.report === auditToApprove.report
        );
        if (audit) {
            audit.status = auditToApprove.comment
                ? 'ApprovedWithComments'
                : 'Approved';
        }
    });
};

export const setNeedsActionAuditReportOperation = (
    state: BudgetStatement,
    action: SetNeedsActionAuditReportAction
) => {
    action.input.reports.forEach(report => {
        const audit = state.data.auditReports.find(
            audit => audit.report === report
        );
        if (audit) {
            audit.status = 'NeedsAction';
        }
    });
};

export const escalateAuditReportOperation = (
    state: BudgetStatement,
    action: EscalateAuditReportAction
) => {
    action.input.reports.forEach(report => {
        const audit = state.data.auditReports.find(
            audit => audit.report === report
        );
        if (audit) {
            audit.status = 'Escalated';
        }
    });
};
