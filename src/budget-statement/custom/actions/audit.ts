import { AddAuditReportAction, DeleteAuditReportAction } from '../../gen/audit';
import { BudgetStatement } from '../types';

export const addAuditReportOperation = (
    state: BudgetStatement,
    action: AddAuditReportAction
) => {
    state.data.auditReports.push(...action.input.reports);
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
