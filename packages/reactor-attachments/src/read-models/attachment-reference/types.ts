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

/**
 * Pages the whole reference index, in a stable order, for a consumer that has
 * to re-derive work from it on boot -- the `AttachmentReplicator`'s resume.
 *
 * Separate from {@link IAttachmentReferenceReader} rather than added to it:
 * the reader is the authorization surface every attachment read goes through,
 * and a full-table scan is a different capability with a different cost. A
 * forwarding or remote reader can implement the first without the second.
 */
export interface IAttachmentReferenceScanner {
  /**
   * References after `cursor` (absent for the first page), at most `limit` of
   * them, plus the cursor for the next page (absent when exhausted). The order
   * is the index's own key order, so paging cannot skip or repeat a row while
   * new references are being inserted behind the cursor.
   */
  listReferences(
    cursor: string | undefined,
    limit: number,
  ): Promise<AttachmentReferencePageResult>;
}

/** One page of {@link IAttachmentReferenceScanner.listReferences}. */
export interface AttachmentReferencePageResult {
  references: readonly AttachmentReferenceRow[];
  nextCursor: string | undefined;
}

/** A reference as the index holds it: the document that authorizes a ref. */
export interface AttachmentReferenceRow {
  documentId: string;
  ref: AttachmentRef;
}

export interface IAttachmentReferenceWriter {
  addReferences(references: readonly AttachmentReferenceInput[]): Promise<void>;
  /** Deletes every reference of the documents; for a purged document. */
  removeDocuments(documentIds: readonly string[]): Promise<void>;
}
