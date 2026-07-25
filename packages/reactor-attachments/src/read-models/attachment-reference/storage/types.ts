export interface AttachmentReferenceTable {
  document_id: string;
  attachment_ref: string;
  attachment_hash: string;
  first_operation_id: string;
  branch: string;
  scope: string;
  first_seen_ordinal: number;
  created_at_utc: string;
}

export interface AttachmentReferenceDatabase {
  attachment_reference: AttachmentReferenceTable;
}
