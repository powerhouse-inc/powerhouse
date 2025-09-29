import type {
  Operation,
  PHDocumentHeader,
  PHDocumentMeta,
} from "document-model";

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
  setSlug(slug: string): void;
  setName(name: string): void;
  setMeta(meta: PHDocumentMeta): void;
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
    index: number,
    signal?: AbortSignal,
  ): Promise<Operation>;
}
