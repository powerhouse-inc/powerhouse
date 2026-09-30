import type { ColumnType, Generated } from "kysely";

export type ErasureRequestStatus = "open" | "complete" | "failed";

export type ErasureItemStatus =
  | "waiting"
  | "purging"
  | "purged"
  | "erased"
  | "failed";

export type ErasureAuditEvent =
  | "requested"
  | "expanded"
  | "waiting"
  | "purged"
  | "marker-converged"
  | "marker-undelivered"
  | "remotes-removed"
  | "permissions-erased"
  | "deadline-passed"
  | "failed";

export type SubjectRole =
  | "signer"
  | "app-key"
  | "creator"
  | "header-key"
  | "named";

type Bigint = ColumnType<string | number, number | bigint, number | bigint>;

export interface ErasureRequestTable {
  requestId: string;
  subjectHash: string | null;
  requestedBy: string;
  requestedAt: Date;
  deadline: Date;
  status: ErasureRequestStatus;
}

export interface ErasureItemTable {
  requestId: string;
  documentId: string;
  status: ErasureItemStatus;
  allowLarge: ColumnType<boolean, boolean | undefined, boolean>;
  markerOrdinal: Bigint | null;
  lastError: string | null;
  updatedAt: Date;
}

export interface ErasureAuditTable {
  ordinal: Generated<string>;
  requestId: string;
  documentId: string | null;
  event: ErasureAuditEvent;
  detail: unknown;
  atUtc: Date;
}

export interface SubjectDocumentTable {
  subjectHash: string;
  documentId: string;
  role: SubjectRole;
  firstOrdinal: Bigint;
  lastOrdinal: Bigint;
}

export interface ReactorPrivacyDatabase {
  erasure_requests: ErasureRequestTable;
  erasure_items: ErasureItemTable;
  erasure_audit: ErasureAuditTable;
  subject_documents: SubjectDocumentTable;
}
