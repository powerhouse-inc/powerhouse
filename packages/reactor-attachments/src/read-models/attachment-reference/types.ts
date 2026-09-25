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
  /** The scopes whose operations reference the attachment; empty when none. */
  referencingScopes(documentId: string, ref: AttachmentRef): Promise<string[]>;
}

export interface IAttachmentReferenceWriter {
  addReferences(references: readonly AttachmentReferenceInput[]): Promise<void>;
}
