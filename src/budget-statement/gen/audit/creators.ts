import { createAction } from '../../../document';
import { AuditReport, AuditReportInput } from '../../custom';
import {
    AddAuditReportAction,
    ADD_AUDIT_REPORT,
    ApproveAuditReportAction,
    APPROVE_AUDIT_REPORT,
    DeleteAuditReportAction,
    DELETE_AUDIT_REPORT,
    EscalateAuditReportAction,
    ESCALATE_AUDIT_REPORT,
    SetNeedsActionAuditReportAction,
    SET_NEEDS_ACTION_AUDIT_REPORT,
} from './types';

export const addAuditReport = (reports: AuditReportInput[]) =>
    createAction<AddAuditReportAction>(ADD_AUDIT_REPORT, { reports });

export const deleteAuditReport = (reports: AuditReport['report'][]) =>
    createAction<DeleteAuditReportAction>(DELETE_AUDIT_REPORT, { reports });

export const approveAuditReport = (
    reports: {
        report: AuditReport['report'];
        comment?: string | undefined;
    }[]
) =>
    createAction<ApproveAuditReportAction>(APPROVE_AUDIT_REPORT, {
        reports,
    });

export const setNeedsActionAuditReport = (reports: AuditReport['report'][]) =>
    createAction<SetNeedsActionAuditReportAction>(
        SET_NEEDS_ACTION_AUDIT_REPORT,
        { reports }
    );

export const escalateAuditReport = (reports: AuditReport['report'][]) =>
    createAction<EscalateAuditReportAction>(ESCALATE_AUDIT_REPORT, { reports });
