import {
  DocumentChangeType,
  type DocumentChangeEvent,
  type IReactorClient,
} from "@powerhousedao/reactor";
import type { PHDocument } from "document-model";
import { addPromiseState, readPromiseState } from "./document-cache.js";
import type {
  FulfilledPromise,
  IDocumentCache,
  PromiseWithState,
} from "./types/documents.js";

/**
 * Document cache implementation that uses the new ReactorClient API.
 *
 * This cache subscribes to document change events via IReactorClient.subscribe()
 * and automatically updates the cache when documents are created, updated, or deleted.
 *
 * Use this implementation when FEATURE_LEGACY_READ_ENABLED is false.
 */
export class ReactorClientDocumentCache implements IDocumentCache {
  private documents = new Map<string, PromiseWithState<PHDocument>>();
  private batchPromises = new Map<
    string,
    { promises: Promise<PHDocument>[]; promise: Promise<PHDocument[]> }
  >();
  private listeners = new Map<string, (() => void)[]>();
  private unsubscribe: (() => void) | null = null;

  constructor(private client: IReactorClient) {
    this.unsubscribe = client.subscribe({}, (event: DocumentChangeEvent) => {
      this.handleDocumentChange(event);
    });
  }

  private handleDocumentChange(event: DocumentChangeEvent): void {
    if (event.type === DocumentChangeType.Deleted) {
      const documentId = event.context?.childId;
      if (documentId) {
        this.handleDocumentDeleted(documentId);
      }
    } else if (event.type === DocumentChangeType.Updated) {
      for (const doc of event.documents) {
        this.handleDocumentUpdated(doc.header.id).catch(console.warn);
      }
    }
  }

  private handleDocumentDeleted(documentId: string): void {
    const listeners = this.listeners.get(documentId);
    this.documents.delete(documentId);
    this.invalidateBatchesContaining(documentId);
    if (listeners) {
      listeners.forEach((listener) => listener());
    }
    this.listeners.delete(documentId);
  }

  private async handleDocumentUpdated(documentId: string): Promise<void> {
    if (this.documents.has(documentId)) {
      await this.get(documentId, true);
      const listeners = this.listeners.get(documentId);
      if (listeners) {
        listeners.forEach((listener) => listener());
      }
    }
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
    this.documents.set(id, addPromiseState(documentPromise));
    return documentPromise;
  }

  getBatch(ids: string[]): Promise<PHDocument[]> {
    const key = ids.join(",");
    const cached = this.batchPromises.get(key);

    const hasDeletedDocuments = ids.some((id) => !this.documents.has(id));
    const currentPromises = ids.map((id) => this.get(id));

    if (hasDeletedDocuments) {
      const batchPromise = Promise.all(currentPromises);
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
    const allFulfilled = states.every((s) => s.status === "fulfilled");

    if (allFulfilled) {
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

    if (cached) {
      return cached.promise;
    }

    const batchPromise = Promise.all(currentPromises);
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

  /**
   * Disposes of the cache and unsubscribes from document change events.
   */
  dispose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }
}
