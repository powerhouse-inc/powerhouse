import type { Operation } from "document-model";
import type { Generated, Insertable, Selectable, Updateable } from "kysely";
import type {
  PagedResults,
  PagingOptions,
  ViewFilter,
} from "../storage/interfaces.js";

export type OperationIndexEntry = Operation & {
  ordinal?: number;
  documentId: string;
  documentType: string;
  branch: string;
  scope: string;
};

export interface IOperationIndexTxn {
  createCollection(collectionId: string): void;
  addToCollection(collectionId: string, documentId: string): void;
  write(operations: OperationIndexEntry[]): void;
}

export interface IOperationIndex {
  start(): IOperationIndexTxn;
  commit(txn: IOperationIndexTxn, signal?: AbortSignal): Promise<void>;
  find(
    collectionId: string,
    cursor?: number,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<OperationIndexEntry>>;
}

export interface DocumentCollectionTable {
  documentId: string;
  collectionId: string;
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

export type DocumentCollectionRow = Selectable<DocumentCollectionTable>;
export type InsertableDocumentCollection = Insertable<DocumentCollectionTable>;
export type UpdateableDocumentCollection = Updateable<DocumentCollectionTable>;

export type OperationIndexOperationRow =
  Selectable<OperationIndexOperationTable>;
export type InsertableOperationIndexOperation =
  Insertable<OperationIndexOperationTable>;
export type UpdateableOperationIndexOperation =
  Updateable<OperationIndexOperationTable>;

export function driveCollectionId(branch: string, driveId: string): string {
  return `drive.${branch}.${driveId}`;
}
