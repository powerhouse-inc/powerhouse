import {
    AddAuditReportInput,
    z,
} from '@acaldas/document-model-graphql/budget-statement';
import { InputDocumentFile } from '../../../document/types';
import { createAction } from '../../../document/utils';
import { AuditReport } from '../../custom';
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
 * @group Audit
 */
export const addAuditReport = (
    reports: AddAuditReportInput['reports'],
    attachments: InputDocumentFile[]
) => {
    return createAction<AddAuditReportAction>(
        ADD_AUDIT_REPORT,
        { reports },
        attachments,
        z.AddAuditReportActionSchema
    );
};

/**
 * Creates an action to delete one or more audit reports from the state.
 *
 * @param reports - An array of reports to be deleted.
 * @returns The created action.
 * @group Audit
 */
export const deleteAuditReport = (reports: AuditReport['report'][]) =>
    createAction<DeleteAuditReportAction>(
        DELETE_AUDIT_REPORT,
        { reports },
        undefined,
        z.DeleteAuditReportActionSchema
    );
