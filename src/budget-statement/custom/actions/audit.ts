import { AddAuditReportAction, DeleteAuditReportAction } from '../../gen/audit';
import { BudgetStatement } from '../types';

export const addAuditReportOperation = (
    state: BudgetStatement,
    action: AddAuditReportAction
) => {
    action.input.reports.forEach(audit => {
        const attachmentKey = `attachment://audits/${audit.timestamp}` as const;
        state.fileRegistry[attachmentKey] = {
            data: audit.report.data,
            mimeType: audit.report.mimeType,
        };
        state.data.auditReports.push({
            timestamp: audit.timestamp,
            status: audit.status,
            report: attachmentKey,
        });

        // const operation = state.operations[
        //     state.operations.length - 1
        // ] as Operation<AddAuditReportAction>;

        // operation.input.reports[index].report = attachmentKey as any; // TODO
    });
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
