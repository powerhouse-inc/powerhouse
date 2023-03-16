import { createAction, fetchAttachment } from '../../../document';
import { AuditReport, AuditReportInput } from '../../custom';
import {
    AddAuditReportAction,
    ADD_AUDIT_REPORT,
    DeleteAuditReportAction,
    DELETE_AUDIT_REPORT,
} from './types';

export const addAuditReport = async (reports: AuditReportInput[]) => {
    const newTimestamp = new Date();
    const newReports = await Promise.all(
        reports.map(async ({ timestamp, report, status }) => ({
            report: await fetchAttachment(report),
            timestamp: timestamp ?? newTimestamp.toISOString(),
            status,
        }))
    );
    return createAction<AddAuditReportAction>(ADD_AUDIT_REPORT, {
        reports: newReports,
    });
};

export const deleteAuditReport = (reports: AuditReport['report'][]) =>
    createAction<DeleteAuditReportAction>(DELETE_AUDIT_REPORT, { reports });
