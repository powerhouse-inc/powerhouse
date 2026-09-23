import type { ColumnType, Generated } from "kysely";

/** A bigint column: pg reads it back as a string, PGlite as a number. */
type Int8 = ColumnType<
  string | number | bigint,
  string | number,
  string | number
>;

export interface SubjectDocumentTable {
  subjectHash: string;
  documentId: string;
  role: string;
  firstOrdinal: Int8;
  lastOrdinal: Int8;
}

export interface PrivacyAuditLogTable {
  ordinal: Generated<string>;
  id: string;
  kind: "disclosure" | "erasure";
  status: string;
  requestId: string | null;
  requester: string | null;
  authoriser: string | null;
  subjectHash: string | null;
  documentIds: ColumnType<string[], string, string>;
  detail: ColumnType<unknown, string, string>;
  createdAtUtc: Generated<Date>;
}

export interface ReactorPrivacyDatabase {
  subject_documents: SubjectDocumentTable;
  privacy_audit_log: PrivacyAuditLogTable;
}
