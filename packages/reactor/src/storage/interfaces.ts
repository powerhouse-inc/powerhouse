import type { Operation, PHDocument } from "document-model";

export type OperationContext = {
  documentId: string;
  documentType: string;
  scope: string;
  branch: string;
  resultingState?: string;
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

  getSince(
    documentId: string,
    scope: string,
    branch: string,
    revision: number,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<Operation>>;

  getSinceId(
    id: number,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<OperationWithContext>>;

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

export interface IKeyframeStore {
  putKeyframe(
    documentId: string,
    documentType: string,
    scope: string,
    branch: string,
    revision: number,
    document: PHDocument,
    signal?: AbortSignal,
  ): Promise<void>;

  findNearestKeyframe(
    documentId: string,
    scope: string,
    branch: string,
    targetRevision: number,
    signal?: AbortSignal,
  ): Promise<{ revision: number; document: PHDocument } | undefined>;

  deleteKeyframes(
    documentId: string,
    scope?: string,
    branch?: string,
    signal?: AbortSignal,
  ): Promise<number>;
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
   *
   * @param items - Operations with context. Context MUST include ephemeral
   *                `resultingState` for optimization. IDocumentView never rebuilds
   *                documents from operations - it always requires resultingState.
   */
  indexOperations(items: OperationWithContext[]): Promise<void>;

  /**
   * Returns true if and only if the documents exist.
   *
   * @param documentIds - The list of document ids to check.
   * @param signal - Optional abort signal to cancel the request
   */
  exists(documentIds: string[], signal?: AbortSignal): Promise<boolean[]>;

  /**
   * Returns the document with the given id.
   *
   * @param documentId - The id of the document to get.
   * @param view - Optional filter containing branch and scopes information
   * @param signal - Optional abort signal to cancel the request
   */
  get<TDocument extends PHDocument>(
    documentId: string,
    view?: ViewFilter,
    signal?: AbortSignal,
  ): Promise<TDocument>;
}
