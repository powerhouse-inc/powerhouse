/**
 * This is a scaffold file meant for customization:
 * - modify it by implementing the reducer functions
 * - delete the file and run the code generator again to have it reset
 */

import { BudgetStatementState } from '../../gen';
import { BudgetStatementAuditOperations } from '../../gen/audit/operations';

function checkDuplicatedReport(state: BudgetStatementState, report: string) {
    if (state.auditReports.find((audit) => audit.report === report)) {
        throw new Error(`Audit with report ${report} already exists`);
    }
}

export const reducer: BudgetStatementAuditOperations = {
    addAuditReportOperation(state, action) {
        checkDuplicatedReport(state, action.input.report);
        if (
            !action.attachments.find(
                (attachment) => attachment.hash === action.input.report,
            )
        ) {
            throw new Error(
                'Report was not included in the action attachments',
            );
        }
        state.auditReports.push({
            ...action.input,
            timestamp: action.input.timestamp ?? new Date().toISOString(),
        });
    },
    deleteAuditReportOperation(state, action) {
        const index = state.auditReports.findIndex(
            (audit) => audit.report === action.input.report,
        );
        if (index > -1) {
            state.auditReports.splice(index, 1);
        }
    },
};
