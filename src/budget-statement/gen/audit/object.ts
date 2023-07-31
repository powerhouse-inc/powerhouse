import { BaseDocument } from '../../../document';
import { DocumentFile } from '../../../document/types';
import {
    AuditReport,
    AuditReportStatus,
    BudgetStatementAction,
    BudgetStatementState,
} from '../../custom';
import { addAuditReport, deleteAuditReport } from './creators';

export default class AuditObject extends BaseDocument<
    BudgetStatementState,
    BudgetStatementAction
> {
    /**
     * Adds audit reports to the budget statement.
     * @param reports - An array of audit report objects to add.
     *
     * @group Audit
     */
    public addAuditReport(
        reports: {
            timestamp?: string;
            status: AuditReportStatus;
            report: DocumentFile;
        }[]
    ) {
        return this.dispatch(addAuditReport(reports));
    }

    /**
     * Deletes audit reports from the budget statement.
     * @param reports - An array of objects that contain the report attachment name of the audits items to be deleted.
     *
     * @group Audit
     */
    public deleteAuditReport(reports: AuditReport['report'][]) {
        return this.dispatch(deleteAuditReport(reports));
    }

    /**
     * Retrieves all audit reports from the budget statement.
     * @returns An array of audit report objects.
     *
     * @group Audit
     */
    public getAuditReports() {
        return this.state.auditReports;
    }

    /**
     * Retrieves a specific audit report from the budget statement.
     * @param report - The name of the attachment of the report to be retrieved.
     * @returns The audit report object if it exists, or undefined if not.
     *
     * @group Audit
     */
    public getAuditReport(report: AuditReport['report']) {
        return this.getAuditReports().find(audit => audit.report === report);
    }
}
