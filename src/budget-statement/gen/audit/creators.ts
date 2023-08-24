import { createAction } from '../../../document/utils';
import { AttachmentInput } from '../../../document';
import {
    AddAuditReportInput,
    DeleteAuditReportInput,
} from '../types';
import {
    AddAuditReportAction,
    DeleteAuditReportAction,
} from './actions';

export const addAuditReport = (input: AddAuditReportInput, attachments: AttachmentInput[] ) =>
    createAction<AddAuditReportAction>(
        'ADD_AUDIT_REPORT',
        {...input},
        attachments 
    );

export const deleteAuditReport = (input: DeleteAuditReportInput) =>
    createAction<DeleteAuditReportAction>(
        'DELETE_AUDIT_REPORT',
        {...input}
    );


