import { AttachmentInput, createAction } from "document-model";
import { AddAuditReportInput, DeleteAuditReportInput } from "../schema/types.js";
import { AddAuditReportInputSchema, DeleteAuditReportInputSchema } from "../schema/zod.js";
import { AddAuditReportAction, DeleteAuditReportAction } from "./actions.js";



export const addAuditReport = (
  input: AddAuditReportInput,
  attachments: AttachmentInput[],
) =>
  createAction<AddAuditReportAction>(
    "ADD_AUDIT_REPORT",
    { ...input },
    attachments,
    AddAuditReportInputSchema,
    "global",
  );

export const deleteAuditReport = (input: DeleteAuditReportInput) =>
  createAction<DeleteAuditReportAction>(
    "DELETE_AUDIT_REPORT",
    { ...input },
    undefined,
    DeleteAuditReportInputSchema,
    "global",
  );
