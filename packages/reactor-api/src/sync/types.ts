import type { Operation } from "document-model";

export type InternalStrandUpdate = {
  operations: Operation[];
  documentId: string;
  documentType: string;
  driveId: string;
  scope: string;
  branch: string;
};
