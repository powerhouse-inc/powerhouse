import type { Operation, PHDocumentHeader } from "document-model";

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

export interface IOperationStore {
  apply(
    documentId: string,
    scope: string,
    branch: string,
    revision: number,
    fn: (txn: AtomicTxn) => void | Promise<void>,
    signal?: AbortSignal,
  ): Promise<void>;

  getHeader(
    documentId: string,
    branch: string,
    revision: number,
    signal?: AbortSignal,
  ): Promise<PHDocumentHeader>;

  get(
    documentId: string,
    scope: string,
    branch: string,
    revision: number,
    signal?: AbortSignal,
  ): Promise<Operation>;

  getSince(
    documentId: string,
    scope: string,
    branch: string,
    revision: number,
    signal?: AbortSignal,
  ): Promise<Operation[]>;

  getSinceTimestamp(
    documentId: string,
    scope: string,
    branch: string,
    timestampUtcMs: number,
    signal?: AbortSignal,
  ): Promise<Operation[]>;

  getSinceId(id: number, signal?: AbortSignal): Promise<Operation[]>;
}

export interface ViewFilter {
  branch?: string;
  scopes?: string[];
}

export interface SearchFilter {
  documentType?: string;
  parentId?: string;
  identifiers?: Record<string, any>;
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

export interface IDocumentView {
  /**
   * Initializes the view.
   */
  init(): Promise<void>;

  /**
   * Indexes a list of operations.
   */
  indexOperations(operations: Operation[]): Promise<void>;

  /**
   * Returns true if and only if the documents exist.
   *
   * @param documentIds - The list of document ids to check.
   * @param signal - Optional abort signal to cancel the request
   */
  exists(documentIds: string[], signal?: AbortSignal): Promise<boolean[]>;
}
