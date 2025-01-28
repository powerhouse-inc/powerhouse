import { utils, AttachmentInput } from "document-model/document";
import { z, AddAuditReportInput, DeleteAuditReportInput } from "../types";
import { AddAuditReportAction, DeleteAuditReportAction } from "./actions";

const { createAction } = utils;

export const addAuditReport = (
  input: AddAuditReportInput,
  attachments: AttachmentInput[],
) =>
  createAction<AddAuditReportAction>(
    "ADD_AUDIT_REPORT",
    { ...input },
    attachments,
    z.AddAuditReportInputSchema,
    "global",
  );

export const deleteAuditReport = (input: DeleteAuditReportInput) =>
  createAction<DeleteAuditReportAction>(
    "DELETE_AUDIT_REPORT",
    { ...input },
    undefined,
    z.DeleteAuditReportInputSchema,
    "global",
  );
