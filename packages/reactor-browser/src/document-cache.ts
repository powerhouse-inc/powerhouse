import type { DocumentChangeEvent, PagedResults } from "@powerhousedao/reactor";
import { DOCUMENT_CHANGE_TYPE } from "./reactor-interop.js";
import type {
  Operation,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import type {
  FulfilledPromise,
  IDocumentCache,
  IOperationCache,
  OperationsCacheEntry,
  PromiseState,
  PromiseWithState,
  RejectedPromise,
} from "./types/documents.js";
import type { IReactorBrowserClient } from "./types/reactor-browser-client.js";

export function addPromiseState<T>(promise: Promise<T>): PromiseWithState<T> {
  if ("status" in promise) {
    return promise as PromiseWithState<T>;
  }

  const promiseWithState = promise as PromiseWithState<T>;
  promiseWithState.status = "pending";
  promiseWithState.then(
    (value) => {
      promiseWithState.status = "fulfilled";
      (promiseWithState as FulfilledPromise<T>).value = value;
    },
    (reason) => {
      promiseWithState.status = "rejected";
      (promiseWithState as RejectedPromise<T>).reason = reason;
      // Re-throw to preserve unhandled rejection behavior
      // This allows React's error boundaries to catch the error
      throw reason;
    },
  );

  return promiseWithState;
}

export function readPromiseState<T>(
  promise: Promise<T> | PromiseWithState<T>,
): PromiseState<T> {
  return "status" in promise ? promise : { status: "pending" };
}

/**
 * Resolves an array of document promises using `Promise.allSettled`,
 * returning only the fulfilled values. A single missing/rejected
 * document does not poison the whole batch. Rejected entries are
 * logged at warn level so developers can see dangling references.
 */
function fulfilledOnly(promises: Promise<PHDocument>[]): Promise<PHDocument[]> {
  return Promise.allSettled(promises).then((results) => {
    const documents: PHDocument[] = [];
    for (const result of results) {
      if (result.status === "fulfilled") {
        documents.push(result.value);
      } else {
        console.warn(
          "[DocumentCache] Skipped unavailable document:",
          result.reason,
        );
      }
    }
    return documents;
  });
}

/** The snapshot every uncached document scope reads as. One frozen object, so `useSyncExternalStore` sees a stable value. */
export const IDLE_OPERATIONS_ENTRY: OperationsCacheEntry = Object.freeze({
  status: "idle",
  operations: Object.freeze([]) as readonly Operation[],
  error: undefined,
  hasNextPage: false,
  totalCount: undefined,
});

/** Whether a document cache also serves operation history. `GraphQLClientDocumentCache` does not. */
export function isOperationCache(cache: unknown): cache is IOperationCache {
  if (typeof cache !== "object" || cache === null) return false;
  const candidate = cache as Partial<IOperationCache>;
  return (
    typeof candidate.getOperationsState === "function" &&
    typeof candidate.loadOperations === "function" &&
    typeof candidate.loadMoreOperations === "function" &&
    typeof candidate.invalidateOperations === "function" &&
    typeof candidate.subscribeOperations === "function"
  );
}

/**
 * Page size used to refresh a scope whose request record has gone missing.
 * A loaded scope always has one, so this is a floor rather than a default.
 */
const FALLBACK_REFRESH_LIMIT = 100;

/**
 * The highest revision among the operations loaded so far, or -1 for none.
 * Pages arrive oldest first, so this is normally the last entry; it is
 * computed rather than assumed because nothing in the cache enforces that.
 */
function highestOperationIndex(operations: readonly Operation[]): number {
  let highest = -1;
  for (const operation of operations) {
    if (operation.index > highest) highest = operation.index;
  }
  return highest;
}

/** Bookkeeping for one document scope that is not part of its snapshot. */
type OperationsRequest = {
  /** Aborts the request in flight, or marks a settled one as superseded. */
  controller: AbortController;
  /** The cursor for the page after the last loaded one; `undefined` when there is none. */
  nextCursor: string | undefined;
  /** The page size the scope was loaded with, reused for every subsequent page. */
  limit: number;
};

/**
 * Document cache implementation that uses the new ReactorClient API.
 *
 * This cache subscribes to document change events via IReactorBrowserClient.subscribe()
 * and automatically updates the cache when documents are created, updated, or deleted.
 * It also holds paginated operation history per document scope (see `IOperationCache`),
 * which is dropped for a document whenever a change event for it arrives.
 */
export class DocumentCache implements IDocumentCache, IOperationCache {
  private documents = new Map<string, PromiseWithState<PHDocument>>();
  private batchPromises = new Map<
    string,
    { promises: Promise<PHDocument>[]; promise: Promise<PHDocument[]> }
  >();
  private listeners = new Map<string, (() => void)[]>();

  /**
   * Cache keys that fetched a document under a name other than its id --
   * slugs, which `client.get` resolves. Change events dispatch by `header.id`,
   * so without this mapping a slug-keyed entry (and its listeners) would never
   * see an update: keyed by the id the events carry, valued by the other keys
   * the same document is cached under.
   */
  private aliasKeys = new Map<string, Set<string>>();

  /** Operations by document id, then scope. Entries are replaced, never mutated. */
  private operationEntries = new Map<
    string,
    Map<string, OperationsCacheEntry>
  >();
  /** In-flight controllers and the next page's cursor/limit, by document id then scope. */
  private operationRequests = new Map<string, Map<string, OperationsRequest>>();
  private operationListeners = new Map<string, (() => void)[]>();

  private unsubscribe: (() => void) | null = null;

  constructor(private client: IReactorBrowserClient) {
    this.unsubscribe = client.subscribe({}, (event: DocumentChangeEvent) => {
      this.handleDocumentChange(event);
    });
  }

  private handleDocumentChange(event: DocumentChangeEvent): void {
    if (event.type === DOCUMENT_CHANGE_TYPE.Deleted) {
      const documentId = event.context?.childId;
      if (documentId) {
        // Read the alias keys before `handleDocumentDeleted` clears them, so a
        // slug-keyed operations entry is invalidated too.
        const keys = this.cacheKeysFor(documentId);
        this.handleDocumentDeleted(documentId);
        for (const key of keys) {
          this.invalidateOperations(key);
        }
      }
    } else if (event.type === DOCUMENT_CHANGE_TYPE.Updated) {
      for (const doc of event.documents) {
        const keys = this.cacheKeysFor(doc.header.id);
        this.handleDocumentUpdated(doc.header.id).catch(console.warn);
        for (const key of keys) {
          this.refreshOperations(key);
        }
      }
    }
  }

  private handleDocumentDeleted(documentId: string): void {
    for (const key of this.cacheKeysFor(documentId)) {
      const listeners = this.listeners.get(key);
      this.documents.delete(key);
      this.invalidateBatchesContaining(key);
      if (listeners) {
        listeners.forEach((listener) => listener());
      }
      this.listeners.delete(key);
    }
    this.aliasKeys.delete(documentId);
  }

  private async handleDocumentUpdated(documentId: string): Promise<void> {
    for (const key of this.cacheKeysFor(documentId)) {
      if (!this.documents.has(key)) {
        continue;
      }
      await this.get(key, true);
      const listeners = this.listeners.get(key);
      if (listeners) {
        listeners.forEach((listener) => listener());
      }
    }
  }

  /** The id an event dispatches by, plus every alias the document is cached under. */
  private cacheKeysFor(documentId: string): string[] {
    return [documentId, ...(this.aliasKeys.get(documentId) ?? [])];
  }

  /** Records that `key` cached the document change events know as `header.id`. */
  private recordAlias(documentId: string, key: string): void {
    const keys = this.aliasKeys.get(documentId) ?? new Set<string>();
    keys.add(key);
    this.aliasKeys.set(documentId, keys);
  }

  private invalidateBatchesContaining(documentId: string): void {
    for (const key of this.batchPromises.keys()) {
      if (key.split(",").includes(documentId)) {
        this.batchPromises.delete(key);
      }
    }
  }

  get(id: string, refetch?: boolean): Promise<PHDocument> {
    const currentData = this.documents.get(id);
    if (currentData) {
      if (currentData.status === "pending") {
        return currentData;
      }
      if (!refetch) {
        return currentData;
      }
    }

    const documentPromise = this.client.get(id);
    documentPromise.then(
      (doc) => {
        if (doc.header.id !== id) {
          this.recordAlias(doc.header.id, id);
        }
      },
      // Rejections are surfaced by the stored promise; this chain only learns aliases.
      () => undefined,
    );
    this.documents.set(id, addPromiseState(documentPromise));
    return documentPromise;
  }

  getBatch(ids: string[]): Promise<PHDocument[]> {
    const key = ids.join(",");
    const cached = this.batchPromises.get(key);

    const hasDeletedDocuments = ids.some((id) => !this.documents.has(id));
    const currentPromises = ids.map((id) => this.get(id));

    if (hasDeletedDocuments) {
      const batchPromise = fulfilledOnly(currentPromises);
      this.batchPromises.set(key, {
        promises: currentPromises,
        promise: batchPromise,
      });
      return batchPromise;
    }

    if (cached) {
      const samePromises = currentPromises.every(
        (p, i) => p === cached.promises[i],
      );
      if (samePromises) {
        return cached.promise;
      }
    }

    const states = currentPromises.map((p) =>
      readPromiseState(p as PromiseWithState<PHDocument>),
    );
    const allSettled = states.every((s) => s.status !== "pending");

    if (allSettled) {
      const values = states
        .filter(
          (s): s is { status: "fulfilled"; value: PHDocument } =>
            s.status === "fulfilled",
        )
        .map((s) => s.value);
      const batchPromise = Promise.resolve(values) as PromiseWithState<
        PHDocument[]
      >;
      batchPromise.status = "fulfilled";
      (batchPromise as FulfilledPromise<PHDocument[]>).value = values;

      this.batchPromises.set(key, {
        promises: currentPromises,
        promise: batchPromise,
      });
      return batchPromise;
    }

    if (cached) {
      return cached.promise;
    }

    const batchPromise = fulfilledOnly(currentPromises);
    this.batchPromises.set(key, {
      promises: currentPromises,
      promise: batchPromise,
    });
    return batchPromise;
  }

  subscribe(id: string | string[], callback: () => void): () => void {
    const ids = Array.isArray(id) ? id : [id];
    for (const docId of ids) {
      const listeners = this.listeners.get(docId) ?? [];
      this.listeners.set(docId, [...listeners, callback]);
    }
    return () => {
      for (const docId of ids) {
        const listeners = this.listeners.get(docId) ?? [];
        this.listeners.set(
          docId,
          listeners.filter((listener) => listener !== callback),
        );
      }
    };
  }

  getOperationsState(documentId: string, scope: string): OperationsCacheEntry {
    return (
      this.operationEntries.get(documentId)?.get(scope) ?? IDLE_OPERATIONS_ENTRY
    );
  }

  loadOperations(documentId: string, scope: string, limit: number): void {
    const current = this.getOperationsState(documentId, scope);
    if (current.status !== "idle") {
      return;
    }
    const controller = new AbortController();
    this.setOperationsRequest(documentId, scope, {
      controller,
      nextCursor: undefined,
      limit,
    });
    this.setOperationsEntry(documentId, scope, {
      ...current,
      status: "pending",
    });
    this.settleOperationsPage(
      documentId,
      scope,
      this.client.getOperations(
        documentId,
        { scopes: [scope] },
        undefined,
        { cursor: "", limit },
        controller.signal,
      ),
      controller,
      limit,
    );
  }

  loadMoreOperations(documentId: string, scope: string): void {
    const current = this.getOperationsState(documentId, scope);
    const request = this.operationRequests.get(documentId)?.get(scope);
    if (
      current.status !== "success" ||
      !current.hasNextPage ||
      !request?.nextCursor
    ) {
      return;
    }
    // Each page gets its own controller, so invalidation can abort whichever
    // page is currently in flight.
    const controller = new AbortController();
    const { nextCursor, limit } = request;
    this.setOperationsRequest(documentId, scope, {
      controller,
      nextCursor,
      limit,
    });
    this.setOperationsEntry(documentId, scope, {
      ...current,
      status: "pending",
    });
    this.settleOperationsPage(
      documentId,
      scope,
      this.client.getOperations(
        documentId,
        { scopes: [scope] },
        undefined,
        { cursor: nextCursor, limit },
        controller.signal,
      ),
      controller,
      limit,
    );
  }

  /**
   * Bring a document's cached scopes up to date after it changed, without
   * throwing away what is already loaded.
   *
   * The operation stream is append-only: an update adds operations at higher
   * revisions and never rewrites the ones below, so history already paged in
   * is still correct. Dropping it meant a panel showing a fully loaded
   * document re-walked every page on each edit -- the cost of which grows
   * with the document, exactly where it hurts most. Each scope instead asks
   * only for what comes after the newest revision it holds, using the
   * `sinceRevision` filter, and appends the answer.
   *
   * A scope that has not finished paging is dropped as before: it has no
   * meaningful "newest revision" to resume from, since asking for everything
   * past the newest row it happens to hold would skip the pages between that
   * row and the end of the stream.
   */
  private refreshOperations(documentId: string): void {
    const scopes = this.operationEntries.get(documentId);
    if (!scopes) return;

    for (const [scope, entry] of [...scopes.entries()]) {
      if (entry.status !== "success" || entry.hasNextPage) {
        this.invalidateOperationsScope(documentId, scope);
        continue;
      }

      const previous = this.operationRequests.get(documentId)?.get(scope);
      const limit = previous?.limit ?? FALLBACK_REFRESH_LIMIT;
      // Marks the settled page superseded, so a late arrival cannot append
      // on top of the refresh.
      previous?.controller.abort();

      const controller = new AbortController();
      this.setOperationsRequest(documentId, scope, {
        controller,
        nextCursor: undefined,
        limit,
      });
      // Pending, but the operations stay in the entry: consumers keep
      // rendering the history they have instead of flashing empty while the
      // tail is fetched.
      this.setOperationsEntry(documentId, scope, {
        ...entry,
        status: "pending",
      });
      this.settleOperationsPage(
        documentId,
        scope,
        this.client.getOperations(
          documentId,
          { scopes: [scope] },
          { sinceRevision: highestOperationIndex(entry.operations) + 1 },
          { cursor: "", limit },
          controller.signal,
        ),
        controller,
        limit,
      );
    }
  }

  /** Drops one scope of a document, aborting its request if one is in flight. */
  private invalidateOperationsScope(documentId: string, scope: string): void {
    const requests = this.operationRequests.get(documentId);
    const request = requests?.get(scope);
    if (request && requests) {
      request.controller.abort();
      requests.delete(scope);
      if (requests.size === 0) {
        this.operationRequests.delete(documentId);
      }
    }
    const scopes = this.operationEntries.get(documentId);
    if (scopes?.delete(scope)) {
      if (scopes.size === 0) {
        this.operationEntries.delete(documentId);
      }
      this.notifyOperationListeners(documentId);
    }
  }

  invalidateOperations(documentId: string): void {
    const requests = this.operationRequests.get(documentId);
    if (requests) {
      for (const request of requests.values()) {
        request.controller.abort();
      }
      this.operationRequests.delete(documentId);
    }
    if (this.operationEntries.delete(documentId)) {
      this.notifyOperationListeners(documentId);
    }
  }

  subscribeOperations(documentId: string, callback: () => void): () => void {
    const listeners = this.operationListeners.get(documentId) ?? [];
    this.operationListeners.set(documentId, [...listeners, callback]);
    return () => {
      const current = this.operationListeners.get(documentId) ?? [];
      this.operationListeners.set(
        documentId,
        current.filter((listener) => listener !== callback),
      );
    };
  }

  private settleOperationsPage(
    documentId: string,
    scope: string,
    page: Promise<PagedResults<Operation>>,
    controller: AbortController,
    limit: number,
  ): void {
    page.then(
      (result) => {
        if (controller.signal.aborted) return;
        const current = this.getOperationsState(documentId, scope);
        this.setOperationsRequest(documentId, scope, {
          controller,
          nextCursor: result.nextCursor,
          limit,
        });
        this.setOperationsEntry(documentId, scope, {
          status: "success",
          operations: [...current.operations, ...result.results],
          error: undefined,
          hasNextPage: !!result.nextCursor,
          totalCount: result.totalCount,
        });
      },
      (reason: unknown) => {
        if (controller.signal.aborted) return;
        const current = this.getOperationsState(documentId, scope);
        this.setOperationsEntry(documentId, scope, {
          ...current,
          status: "error",
          error: reason,
        });
      },
    );
  }

  private setOperationsEntry(
    documentId: string,
    scope: string,
    entry: OperationsCacheEntry,
  ): void {
    const scopes =
      this.operationEntries.get(documentId) ??
      new Map<string, OperationsCacheEntry>();
    scopes.set(scope, entry);
    this.operationEntries.set(documentId, scopes);
    this.notifyOperationListeners(documentId);
  }

  private setOperationsRequest(
    documentId: string,
    scope: string,
    request: OperationsRequest,
  ): void {
    const scopes =
      this.operationRequests.get(documentId) ??
      new Map<string, OperationsRequest>();
    scopes.set(scope, request);
    this.operationRequests.set(documentId, scopes);
  }

  private notifyOperationListeners(documentId: string): void {
    for (const listener of this.operationListeners.get(documentId) ?? []) {
      listener();
    }
  }

  /**
   * Disposes of the cache and unsubscribes from document change events.
   */
  dispose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    for (const requests of this.operationRequests.values()) {
      for (const request of requests.values()) {
        request.controller.abort();
      }
    }
    this.operationRequests.clear();
    this.operationEntries.clear();
    this.operationListeners.clear();
  }
}
