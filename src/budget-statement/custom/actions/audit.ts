import { Operation } from '../../../document/types';
import { hashAttachment } from '../../../document/utils';
import {
    AddAuditReportAction,
    DeleteAuditReportAction,
    isAuditReport,
} from '../../gen/audit/types';
import { BudgetStatementDocument } from '../types';

function checkDuplicatedReport(state: BudgetStatementDocument, report: string) {
    if (state.state.auditReports.find(audit => audit.report === report)) {
        throw new Error(`Audit with report ${report} already exists`);
    }
}

export const addAuditReportOperation = (
    state: BudgetStatementDocument,
    action: AddAuditReportAction
) => {
    const operation = state.operations[
        state.operations.length - 1
    ] as Operation<AddAuditReportAction>;

    action.input.reports.forEach((audit, index) => {
        if (isAuditReport(audit)) {
            // throws if report already exists
            checkDuplicatedReport(state, audit.report);
            state.state.auditReports.push(audit);
        } else {
            const hash = hashAttachment(audit.report.data);
            const attachmentKey = `attachment://audits/${hash}` as const;

            // throws if report already exists
            checkDuplicatedReport(state, attachmentKey);

            state.fileRegistry[attachmentKey] = { ...audit.report };
            state.state.auditReports.push({
                timestamp: audit.timestamp ?? new Date().toISOString(),
                status: audit.status,
                report: attachmentKey,
            });

            operation.input.reports[index].report = attachmentKey;
        }
    });
};

export const deleteAuditReportOperation = (
    state: BudgetStatementDocument,
    action: DeleteAuditReportAction
) => {
    action.input.reports.forEach(report => {
        const index = state.state.auditReports.findIndex(
            audit => audit.report === report
        );
        if (index > -1) {
            state.state.auditReports.splice(index, 1);
        }
    });
};
