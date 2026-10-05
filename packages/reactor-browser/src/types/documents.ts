import type {
  Action,
  DocumentAction,
  Operation,
  PHDocument,
} from "@powerhousedao/shared/document-model";

export type DocumentDispatch<TAction extends Action> = (
  actionOrActions:
    | TAction
    | TAction[]
    | DocumentAction
    | DocumentAction[]
    | undefined,
  onErrors?: (errors: Error[]) => void,
  onSuccess?: (result: PHDocument) => void,
) => void;

export type PromiseWithState<T> = Promise<T> & PromiseState<T>;

export type FulfilledPromise<T> = Promise<T> & {
  status: "fulfilled";
  value: T;
};

export type RejectedPromise<T> = Promise<T> & {
  status: "rejected";
  reason: unknown;
};

export type PromiseState<T> =
  | {
      status: "pending";
    }
  | { status: "fulfilled"; value: T }
  | { status: "rejected"; reason: unknown };

/** A refetch of an already-loaded document. `error` is the last failure that kept the loaded document. */
export type DocumentRefetchState = {
  isRefetching: boolean;
  error: unknown;
};

export interface IDocumentCache {
  get(id: string, refetch?: boolean): Promise<PHDocument>;
  getBatch(ids: string[], refetch?: boolean): Promise<PHDocument[]>;
  subscribe(id: string | string[], callback: () => void): () => void;
  /** Stable snapshot of the refetch of `id`. Optional: not every cache refetches in the background. */
  getRefetchState?(id: string): DocumentRefetchState;
}

/** Snapshot of one document scope's operations as the cache knows them. */
export type OperationsCacheEntry = {
  /** `idle` means nothing has been requested since the last invalidation. */
  status: "idle" | "pending" | "success" | "error";
  /** Every operation loaded so far, oldest first, across all loaded pages. */
  operations: readonly Operation[];
  /** The rejection reason of the last failed page; `undefined` otherwise. */
  error: unknown;
  /** Whether the last loaded page reported a further page. */
  hasNextPage: boolean;
};

/**
 * Operation history keyed by document id and scope. Pages are fetched
 * oldest first and appended. A document change event drops every scope of
 * that document so the next read starts from the first page again.
 */
export interface IOperationCache {
  /** Current snapshot; a shared idle entry when nothing is cached. */
  getOperationsState(documentId: string, scope: string): OperationsCacheEntry;
  /** Loads the first page. No-op unless the entry is idle. */
  loadOperations(documentId: string, scope: string, limit: number): void;
  /** Loads the page after the last one and appends it. No-op unless the entry is loaded and has a next page. */
  loadMoreOperations(documentId: string, scope: string): void;
  /** Drops every cached scope of the document, aborts in-flight requests, notifies listeners. */
  invalidateOperations(documentId: string): void;
  /** Subscribes to changes of any scope of the document. Returns the unsubscribe function. */
  subscribeOperations(documentId: string, callback: () => void): () => void;
}
