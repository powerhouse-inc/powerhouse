import {
    AddAuditReportAction,
    DeleteAuditReportAction,
} from '../../gen/audit/types';
import { BudgetStatementState } from '../types';

function checkDuplicatedReport(state: BudgetStatementState, report: string) {
    if (state.auditReports.find(audit => audit.report === report)) {
        throw new Error(`Audit with report ${report} already exists`);
    }
}

export const addAuditReportOperation = (
    state: BudgetStatementState,
    action: AddAuditReportAction
) => {
    action.input.reports.forEach(audit => {
        checkDuplicatedReport(state, audit.report);
        state.auditReports.push(audit);
    });
};

export const deleteAuditReportOperation = (
    state: BudgetStatementState,
    action: DeleteAuditReportAction
) => {
    action.input.reports.forEach(report => {
        const index = state.auditReports.findIndex(
            audit => audit.report === report
        );
        if (index > -1) {
            state.auditReports.splice(index, 1);
        }
    });
};
