import { createAction } from '../../../document/utils';
import { AuditReport, AuditReportStatus } from '../../custom';
import {
    AddAuditReportAction,
    ADD_AUDIT_REPORT,
    DeleteAuditReportAction,
    DELETE_AUDIT_REPORT,
} from './types';

/**
 * Creates an action to add one or more audit reports to the store.
 *
 * @remarks
 * The `timestamp` property in each report is optional. If not provided, the current time will be used.
 *
 * @param reports - An array of objects representing the audit reports to add.
 *
 * @category Actions
 */
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

/**
 * Creates an action to delete one or more audit reports from the state.
 *
 * @param reports - An array of reports to be deleted.
 * @returns The created action.
 * @category Actions
 */
export const deleteAuditReport = (reports: AuditReport['report'][]) =>
    createAction<DeleteAuditReportAction>(DELETE_AUDIT_REPORT, { reports });
