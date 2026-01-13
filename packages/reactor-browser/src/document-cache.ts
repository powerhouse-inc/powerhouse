import type { IDocumentDriveServer } from "document-drive";
import type { PHDocument } from "document-model";
import type {
  FulfilledPromise,
  IDocumentCache,
  PromiseState,
  PromiseWithState,
  RejectedPromise,
} from "./types/documents.js";

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

export class DocumentCache implements IDocumentCache {
  private documents = new Map<string, PromiseWithState<PHDocument>>();
  private batchPromises = new Map<
    string,
    { promises: Promise<PHDocument>[]; promise: Promise<PHDocument[]> }
  >();
  private listeners = new Map<string, (() => void)[]>();

  constructor(private reactor: IDocumentDriveServer) {
    reactor.on("documentDeleted", (documentId) => {
      const listeners = this.listeners.get(documentId);
      this.documents.delete(documentId);
      // Invalidate any batch that includes this document
      this.#invalidateBatchesContaining(documentId);
      if (listeners) {
        listeners.forEach((listener) => listener());
      }
      this.listeners.delete(documentId);
    });
    reactor.on("operationsAdded", (documentId) => {
      if (this.documents.has(documentId)) {
        this.#updateDocument(documentId).catch(console.warn);
      }
    });
  }

  #invalidateBatchesContaining(documentId: string) {
    for (const key of this.batchPromises.keys()) {
      if (key.split(",").includes(documentId)) {
        this.batchPromises.delete(key);
      }
    }
  }

  async #updateDocument(documentId: string) {
    // Only updates listeners when document refetch is completed.
    // Listeners use stale data while refetch is in progress.
    const result = this.get(documentId, true);

    await result;
    const listeners = this.listeners.get(documentId);
    if (listeners) {
      listeners.forEach((listener) => listener());
    }
  }

  get(id: string, refetch?: boolean): Promise<PHDocument> {
    const currentData = this.documents.get(id);
    if (currentData) {
      // If pending then deduplicate requests
      if (currentData.status === "pending") {
        return currentData;
      }
      if (!refetch) {
        return currentData;
      }
    }

    const documentPromise = this.reactor.getDocument(id);

    this.documents.set(id, addPromiseState(documentPromise));
    return documentPromise;
  }

  getBatch(ids: string[]): Promise<PHDocument[]> {
    const key = ids.join(",");
    const cached = this.batchPromises.get(key);

    // Check if any documents have been removed from cache (deleted)
    // This must be done BEFORE calling get() which would re-add them
    const hasDeletedDocuments = ids.some((id) => !this.documents.has(id));

    // Get current individual promises
    const currentPromises = ids.map((id) => this.get(id));

    // If documents were deleted, don't return stale data - let it fail
    if (hasDeletedDocuments) {
      const batchPromise = Promise.all(currentPromises);
      this.batchPromises.set(key, {
        promises: currentPromises,
        promise: batchPromise,
      });
      return batchPromise;
    }

    // Check if we have a valid cached batch (same underlying promises)
    if (cached) {
      const samePromises = currentPromises.every(
        (p, i) => p === cached.promises[i],
      );
      if (samePromises) {
        return cached.promise;
      }
    }

    // Check the state of all individual promises
    const states = currentPromises.map((p) =>
      readPromiseState(p as PromiseWithState<PHDocument>),
    );
    const allFulfilled = states.every((s) => s.status === "fulfilled");

    if (allFulfilled) {
      // All promises are fulfilled - create a pre-resolved batch promise
      // with status already set to avoid suspending in use()
      const values = states.map(
        (s) => (s as { status: "fulfilled"; value: PHDocument }).value,
      );
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

    // Some promises are pending (refetch in progress) - return stale data if available
    if (cached) {
      return cached.promise;
    }

    // Initial load - create new batch promise
    const batchPromise = Promise.all(currentPromises);
    this.batchPromises.set(key, {
      promises: currentPromises,
      promise: batchPromise,
    });
    return batchPromise;
  }

  subscribe(id: string | string[], callback: () => void): () => void {
    const ids = Array.isArray(id) ? id : [id];
    for (const id of ids) {
      const listeners = this.listeners.get(id) ?? [];
      this.listeners.set(id, [...listeners, callback]);
    }
    return () => {
      for (const id of ids) {
        const listeners = this.listeners.get(id) ?? [];
        this.listeners.set(
          id,
          listeners.filter((listener) => listener !== callback),
        );
      }
    };
  }
}
