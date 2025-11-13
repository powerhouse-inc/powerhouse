import type { Generated, Insertable, Selectable, Updateable } from "kysely";

export interface OperationTable {
  id: Generated<number>;
  jobId: string;
  opId: string;
  prevOpId: string;
  writeTimestampUtcMs: Generated<Date>;
  documentId: string;
  documentType: string;
  scope: string;
  branch: string;
  timestampUtcMs: Date;
  index: number;
  action: unknown; // JSONB type - stored as object
  skip: number;
  error?: string | null;
  hash: string;
}

export interface KeyframeTable {
  id: Generated<number>;
  documentId: string;
  documentType: string;
  scope: string;
  branch: string;
  revision: number;
  document: unknown; // JSONB type - stored as object
  createdAt: Generated<Date>;
}

export interface DocumentCollectionTable {
  documentId: string;
  collectionId: string;
  joinedOrdinal: bigint;
  leftOrdinal: bigint | null;
}

export interface OperationIndexOperationTable {
  ordinal: Generated<number>;
  opId: string;
  documentId: string;
  documentType: string;
  scope: string;
  branch: string;
  timestampUtcMs: bigint;
  writeTimestampUtcMs: Generated<Date>;
  index: number;
  skip: number;
  hash: string;
  action: unknown;
}

export interface SyncRemoteTable {
  name: string;
  collection_id: string;
  channel_type: string;
  channel_parameters: unknown;
  filter_document_ids: unknown;
  filter_scopes: unknown;
  filter_branch: string;
  push_state: string;
  push_last_success_utc_ms: bigint | null;
  push_last_failure_utc_ms: bigint | null;
  push_failure_count: number;
  pull_state: string;
  pull_last_success_utc_ms: bigint | null;
  pull_last_failure_utc_ms: bigint | null;
  pull_failure_count: number;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface SyncCursorTable {
  remote_name: string;
  cursor_ordinal: bigint;
  last_synced_at_utc_ms: bigint | null;
  updated_at: Generated<Date>;
}

export interface Database {
  Operation: OperationTable;
  Keyframe: KeyframeTable;
  document_collections: DocumentCollectionTable;
  operation_index_operations: OperationIndexOperationTable;
  sync_remotes: SyncRemoteTable;
  sync_cursors: SyncCursorTable;
}

export type OperationRow = Selectable<OperationTable>;
export type InsertableOperation = Insertable<OperationTable>;
export type UpdateableOperation = Updateable<OperationTable>;

export type KeyframeRow = Selectable<KeyframeTable>;
export type InsertableKeyframe = Insertable<KeyframeTable>;
export type UpdateableKeyframe = Updateable<KeyframeTable>;

export interface DocumentTable {
  id: string;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface DocumentRelationshipTable {
  id: Generated<string>;
  sourceId: string;
  targetId: string;
  relationshipType: string;
  metadata: unknown; // JSONB type - stored as object
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface IndexerStateTable {
  id: Generated<number>;
  lastOperationId: number;
  lastOperationTimestamp: Generated<Date>;
}

export interface DocumentIndexerDatabase {
  Document: DocumentTable;
  DocumentRelationship: DocumentRelationshipTable;
  IndexerState: IndexerStateTable;
}

export type DocumentRow = Selectable<DocumentTable>;
export type InsertableDocument = Insertable<DocumentTable>;
export type UpdateableDocument = Updateable<DocumentTable>;

export type DocumentRelationshipRow = Selectable<DocumentRelationshipTable>;
export type InsertableDocumentRelationship =
  Insertable<DocumentRelationshipTable>;
export type UpdateableDocumentRelationship =
  Updateable<DocumentRelationshipTable>;

export type IndexerStateRow = Selectable<IndexerStateTable>;
export type InsertableIndexerState = Insertable<IndexerStateTable>;
export type UpdateableIndexerState = Updateable<IndexerStateTable>;

export type DocumentCollectionRow = Selectable<DocumentCollectionTable>;
export type InsertableDocumentCollection = Insertable<DocumentCollectionTable>;
export type UpdateableDocumentCollection = Updateable<DocumentCollectionTable>;

export type OperationIndexOperationRow =
  Selectable<OperationIndexOperationTable>;
export type InsertableOperationIndexOperation =
  Insertable<OperationIndexOperationTable>;
export type UpdateableOperationIndexOperation =
  Updateable<OperationIndexOperationTable>;

export type SyncRemoteRow = Selectable<SyncRemoteTable>;
export type InsertableSyncRemote = Insertable<SyncRemoteTable>;
export type UpdateableSyncRemote = Updateable<SyncRemoteTable>;

export type SyncCursorRow = Selectable<SyncCursorTable>;
export type InsertableSyncCursor = Insertable<SyncCursorTable>;
export type UpdateableSyncCursor = Updateable<SyncCursorTable>;
