import type { Generated, Insertable, Selectable, Updateable } from "kysely";

export interface OperationTable {
  id: Generated<number>;
  jobId: string;
  opId: string;
  prevOpId: string;
  writeTimestampUtcMs: Generated<Date>;
  documentId: string;
  scope: string;
  branch: string;
  timestampUtcMs: Date;
  index: number;
  action: string; // JSON string
  skip: number;
  resultingState?: string | null;
  error?: string | null;
  hash: string;
}

export interface Database {
  Operation: OperationTable;
}

export type OperationRow = Selectable<OperationTable>;
export type InsertableOperation = Insertable<OperationTable>;
export type UpdateableOperation = Updateable<OperationTable>;