import type {
  Operation,
  OperationWithContext,
} from "@powerhousedao/shared/document-model";
import type { Generated, Insertable, Selectable, Updateable } from "kysely";
import type { PagedResults, PagingOptions } from "../shared/types.js";
import type { ViewFilter } from "../storage/interfaces.js";

export type OperationIndexEntry = Operation & {
  ordinal?: number;
  documentId: string;
  documentType: string;
  branch: string;
  scope: string;
  sourceRemote: string;
};

export interface IOperationIndexTxn {
  createCollection(collectionId: string): void;
  addToCollection(collectionId: string, documentId: string): void;
  removeFromCollection(collectionId: string, documentId: string): void;
  write(operations: OperationIndexEntry[]): void;
}

/**
 * Reads are paged with a default limit; follow `next` for the full set.
 */
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
  /**
   * Get all operations for a specific document, ordered by ordinal.
   * Used for retroactive sync when a document is added to a collection.
   */
  get(
    documentId: string,
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
  sourceRemote: Generated<string>;
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

const DRIVE_COLLECTION_PREFIX = "drive.";

/**
 * Identifies the collection a remote synchronizes. Collections are drive-level
 * abstractions (document-drive and reactor-drive), so a collection id is the
 * drive document id plus the branch it scopes to rather than an opaque string.
 *
 * The canonical string form (`drive.${branch}.${driveId}`) is produced only by
 * `key` and parsed only by `fromKey`; that string is the wire and storage
 * representation and is byte-for-byte identical to the legacy
 * `driveCollectionId(branch, driveId)` output, so existing `document_collections`
 * rows and persisted remotes remain valid without migration.
 */
export class DriveCollectionId {
  private constructor(
    readonly driveId: string,
    readonly branch: string,
  ) {}

  static forDrive(driveId: string, branch = "main"): DriveCollectionId {
    return new DriveCollectionId(driveId, branch);
  }

  /**
   * The single deserializer for the wire/storage form. `branch` may contain
   * dots, while `driveId` is a dot-free document id, so the drive id is the
   * final dot-delimited segment.
   */
  static fromKey(key: string): DriveCollectionId {
    if (!key.startsWith(DRIVE_COLLECTION_PREFIX)) {
      throw new Error(`Unsupported collection id: ${key}`);
    }
    const rest = key.slice(DRIVE_COLLECTION_PREFIX.length);
    const lastDot = rest.lastIndexOf(".");
    if (lastDot === -1 || lastDot === rest.length - 1) {
      throw new Error(`Malformed drive collection id: ${key}`);
    }
    return new DriveCollectionId(
      rest.slice(lastDot + 1),
      rest.slice(0, lastDot),
    );
  }

  get key(): string {
    return `${DRIVE_COLLECTION_PREFIX}${this.branch}.${this.driveId}`;
  }

  toString(): string {
    return this.key;
  }

  equals(other: DriveCollectionId): boolean {
    return this.driveId === other.driveId && this.branch === other.branch;
  }
}
