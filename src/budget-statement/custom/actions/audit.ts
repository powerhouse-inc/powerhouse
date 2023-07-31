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
    // TODO
    // const operation = state.operations[
    //     state.operations.length - 1
    // ] as Operation<AddAuditReportAction>;
    action.input.reports.forEach(audit => {
        // if (isAuditReport(audit)) {
        //     // throws if report already exists
        checkDuplicatedReport(state, audit.report);
        state.auditReports.push(audit);
        // } else {
        //     const hash = hashAttachment(audit.report.data);
        //     const attachmentKey = `attachment://audits/${hash}` as const;
        //     // throws if report already exists
        //     checkDuplicatedReport(state, attachmentKey);
        //     state.fileRegistry[attachmentKey] = { ...audit.report };
        //     state.auditReports.push({
        //         timestamp: audit.timestamp ?? new Date().toISOString(),
        //         status: audit.status,
        //         report: attachmentKey,
        //     });
        //     operation.input.reports[index].report = attachmentKey;
        // }
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
