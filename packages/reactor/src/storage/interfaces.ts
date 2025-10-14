import type { Operation, PHDocumentHeader } from "document-model";

export type OperationContext = {
  documentId: string;
  documentType: string;
  scope: string;
  branch: string;
};

export type OperationWithContext = {
  operation: Operation;
  context: OperationContext;
};

export class DuplicateOperationError extends Error {
  constructor(opId: string) {
    super(`Operation with opId ${opId} already exists`);
    this.name = "DuplicateOperationError";
  }
}

export class OptimisticLockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OptimisticLockError";
  }
}

export class RevisionMismatchError extends Error {
  constructor(expected: number, actual: number) {
    super(`Revision mismatch: expected ${expected}, got ${actual}`);
    this.name = "RevisionMismatchError";
  }
}

export interface AtomicTxn {
  addOperations(...operations: Operation[]): void;
}

export type DocumentRevisions = {
  /** Map of scope to operation index for that scope */
  revision: Record<string, number>;

  /** Latest timestamp across revisions */
  latestTimestamp: string;
};

export interface IOperationStore {
  apply(
    documentId: string,
    documentType: string,
    scope: string,
    branch: string,
    revision: number,
    fn: (txn: AtomicTxn) => void | Promise<void>,
    signal?: AbortSignal,
  ): Promise<void>;

  get(
    documentId: string,
    scope: string,
    branch: string,
    revision: number,
    signal?: AbortSignal,
  ): Promise<OperationWithContext>;

  getSince(
    documentId: string,
    scope: string,
    branch: string,
    revision: number,
    signal?: AbortSignal,
  ): Promise<OperationWithContext[]>;

  getSinceTimestamp(
    documentId: string,
    scope: string,
    branch: string,
    timestampUtcMs: number,
    signal?: AbortSignal,
  ): Promise<OperationWithContext[]>;

  getSinceId(id: number, signal?: AbortSignal): Promise<OperationWithContext[]>;

  /**
   * Gets the latest operation index for each scope of a document, along with
   * the latest timestamp across all scopes. This is used to efficiently reconstruct
   * the revision map and lastModified timestamp for document headers.
   *
   * @param documentId - The document id
   * @param branch - The branch name
   * @param signal - Optional abort signal to cancel the request
   * @returns Object containing revision map and latest timestamp
   */
  getRevisions(
    documentId: string,
    branch: string,
    signal?: AbortSignal,
  ): Promise<DocumentRevisions>;
}

export interface ViewFilter {
  branch?: string;
  scopes?: string[];
}

export interface SearchFilter {
  documentType?: string;
  parentId?: string;
  identifiers?: Record<string, any>;
  includeDeleted?: boolean;
}

export interface PagingOptions {
  cursor?: string;
  limit?: number;
}

export interface PagedResults<T> {
  items: T[];
  nextCursor?: string;
  hasMore: boolean;
}

export interface DocumentSnapshot {
  id: string;
  documentId: string;
  slug: string | null;
  name: string | null;
  scope: string;
  branch: string;
  content: string;
  documentType: string;
  lastOperationIndex: number;
  lastOperationHash: string;
  lastUpdatedAt: Date;
  snapshotVersion: number;
  identifiers: string | null;
  metadata: string | null;
  isDeleted: boolean;
  deletedAt: Date | null;
}

export interface IDocumentView {
  /**
   * Initializes the view.
   */
  init(): Promise<void>;

  /**
   * Indexes a list of operations.
   */
  indexOperations(items: OperationWithContext[]): Promise<void>;

  /**
   * Retrieves a document header by reconstructing it from operations across all scopes.
   *
   * Headers contain cross-scope metadata (revision tracking, lastModified timestamps)
   * that require aggregating information from multiple scopes, making this a
   * view-layer concern rather than an operation store concern.
   *
   * @param documentId - The document id
   * @param branch - The branch name
   * @param signal - Optional abort signal to cancel the request
   * @returns The reconstructed document header
   */
  getHeader(
    documentId: string,
    branch: string,
    signal?: AbortSignal,
  ): Promise<PHDocumentHeader>;

  /**
   * Returns true if and only if the documents exist.
   *
   * @param documentIds - The list of document ids to check.
   * @param signal - Optional abort signal to cancel the request
   */
  exists(documentIds: string[], signal?: AbortSignal): Promise<boolean[]>;

  /**
   * Retrieves multiple document snapshots by their IDs.
   *
   * @param documentIds - The list of document ids to retrieve.
   * @param scope - The scope to filter by (default: "global")
   * @param branch - The branch to filter by (default: "main")
   * @param signal - Optional abort signal to cancel the request
   * @returns Array of document snapshots in the same order as input IDs (null for non-existent docs)
   */
  getMany(
    documentIds: string[],
    scope?: string,
    branch?: string,
    signal?: AbortSignal,
  ): Promise<(DocumentSnapshot | null)[]>;
}
