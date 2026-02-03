import type { Operation } from "document-model";
import type { Generated, Insertable, Selectable, Updateable } from "kysely";
import type { PagedResults, PagingOptions } from "../shared/types.js";
import type {
  OperationWithContext,
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
  removeFromCollection(collectionId: string, documentId: string): void;
  write(operations: OperationIndexEntry[]): void;
}

export interface IOperationIndex {
  start(): IOperationIndexTxn;
  commit(txn: IOperationIndexTxn, signal?: AbortSignal): Promise<number[]>;
  find(
    collectionId: string,
    cursor?: number,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<OperationIndexEntry>>;
  getSinceOrdinal(
    ordinal: number,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<OperationWithContext>>;
  getLatestTimestampForCollection(
    collectionId: string,
    signal?: AbortSignal,
  ): Promise<string | null>;
  /**
   * Get all collection memberships for the given document IDs.
   * Returns a map of documentId to array of collection IDs.
   */
  getCollectionsForDocuments(
    documentIds: string[],
  ): Promise<Record<string, string[]>>;
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
  timestampUtcMs: string;
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
