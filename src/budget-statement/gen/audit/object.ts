import { DocumentObject } from '../../../document';
import {
    AuditReport,
    AuditReportStatus,
    BudgetStatementAction,
    State,
} from '../../custom';
import { addAuditReport, deleteAuditReport } from './creators';

export default class AuditObject extends DocumentObject<
    State,
    BudgetStatementAction
> {
    public addAuditReport(
        reports: {
            timestamp?: string;
            status: AuditReportStatus;
            report: {
                data: string;
                mimeType: string;
            };
        }[]
    ) {
        return this.dispatch(addAuditReport(reports));
    }

    public deleteAuditReport(reports: AuditReport['report'][]) {
        return this.dispatch(deleteAuditReport(reports));
    }

    public getAuditReports() {
        return this.state.data.auditReports;
    }

    public getAuditReport(report: AuditReport['report']) {
        return this.getAuditReports().find(audit => audit.report === report);
    }
}
