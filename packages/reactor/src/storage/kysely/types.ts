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
  action: string; // JSON string
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
  document: string; // JSON-serialized PHDocument
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
