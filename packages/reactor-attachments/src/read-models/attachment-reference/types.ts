import type { AttachmentRef } from "@powerhousedao/reactor";

export interface AttachmentReferenceInput {
  documentId: string;
  ref: AttachmentRef;
  operationId: string;
  branch: string;
  scope: string;
  ordinal: number;
}

export interface IAttachmentReferenceReader {
  hasReference(documentId: string, ref: AttachmentRef): Promise<boolean>;
}

export interface IAttachmentReferenceWriter {
  addReferences(references: readonly AttachmentReferenceInput[]): Promise<void>;
}
