import type { Insertable, Selectable, Updateable } from "kysely";

export interface AttachmentTable {
  hash: string;
  mime_type: string;
  file_name: string;
  size_bytes: number;
  extension: string | null;
  status: string;
  storage_path: string;
  source: string;
  created_at_utc: string;
  last_accessed_at_utc: string;
}

export interface AttachmentDatabase {
  attachment: AttachmentTable;
}

export type AttachmentRow = Selectable<AttachmentTable>;
export type InsertableAttachment = Insertable<AttachmentTable>;
export type UpdateableAttachment = Updateable<AttachmentTable>;
