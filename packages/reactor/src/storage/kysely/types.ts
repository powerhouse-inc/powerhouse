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

export interface Database {
  Operation: OperationTable;
  Keyframe: KeyframeTable;
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
