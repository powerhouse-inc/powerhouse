import { createAction } from '../../../document/utils';
import { AuditReport, AuditReportStatus } from '../../custom';
import {
    AddAuditReportAction,
    ADD_AUDIT_REPORT,
    DeleteAuditReportAction,
    DELETE_AUDIT_REPORT,
} from './types';

export const addAuditReport = (
    reports: {
        timestamp?: string;
        status: AuditReportStatus;
        report: {
            data: string;
            mimeType: string;
        };
    }[]
) => {
    const newTimestamp = new Date();
    const newReports = reports.map(({ timestamp, report, status }) => ({
        report,
        timestamp: timestamp ?? newTimestamp.toISOString(),
        status,
    }));
    return createAction<AddAuditReportAction>(ADD_AUDIT_REPORT, {
        reports: newReports,
    });
};

export const deleteAuditReport = (reports: AuditReport['report'][]) =>
    createAction<DeleteAuditReportAction>(DELETE_AUDIT_REPORT, { reports });
