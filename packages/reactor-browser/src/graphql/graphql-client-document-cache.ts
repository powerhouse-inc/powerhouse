import type { PHDocument } from "document-model";
import { forEach } from "remeda";
import { addPromiseState, readPromiseState } from "../document-cache.js";
import type {
  FulfilledPromise,
  IDocumentCache,
  PromiseWithState,
} from "../types/documents.js";
import { DocumentFetcher } from "./document-fetcher.js";

export class GraphQLClientDocumentCache implements IDocumentCache {
  private fetcher: DocumentFetcher;

  private documents = new Map<string, PromiseWithState<PHDocument>>();

  private batchPromises = new Map<
    string,
    {
      promises: readonly Promise<PHDocument>[];
      promise: PromiseWithState<PHDocument[]>;
    }
  >();

  private listeners = new Map<string, (() => void)[]>();

  constructor() {
    this.fetcher = new DocumentFetcher();

    window.addEventListener("MutateDocument", (event) => {
      this.handleDocumentMutated(event.detail.identifier).catch(console.error);
    });

    window.addEventListener("MutateDocumentAsync", (event) => {
      this.handleDocumentMutated(event.detail.identifier).catch(console.error);
    });
  }

  get(id: string, refetch?: boolean): Promise<PHDocument> {
    const current = this.documents.get(id);

    if (current) {
      if (current.status === "pending") {
        return current;
      }

      if (!refetch) {
        return current;
      }
    }

    const promise = addPromiseState(
      this.fetcher.get(id).then((document) => {
        this.invalidateBatchesContaining(id);
        return document;
      }),
    );

    this.documents.set(id, promise);

    return promise;
  }

  getBatch(ids: string[]): Promise<PHDocument[]> {
    const key = ids.join(",");
    const cached = this.batchPromises.get(key);

    const currentPromises = ids.map((id) => this.get(id));

    if (cached) {
      const samePromises = currentPromises.every(
        (promise, index) => promise === cached.promises[index],
      );

      if (samePromises) {
        return cached.promise;
      }
    }

    const states = currentPromises.map((promise) =>
      readPromiseState(promise as PromiseWithState<PHDocument>),
    );

    const allSettled = states.every((state) => state.status !== "pending");

    if (allSettled) {
      const values = states
        .filter(
          (state): state is { status: "fulfilled"; value: PHDocument } =>
            state.status === "fulfilled",
        )
        .map((state) => state.value);

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

    const batchPromise = addPromiseState(
      Promise.allSettled(currentPromises).then((results) => {
        const documents: PHDocument[] = [];
        for (const result of results) {
          if (result.status === "fulfilled") {
            documents.push(result.value);
          } else {
            console.warn(
              "[GraphQLClientDocumentCache] Skipped unavailable document:",
              result.reason,
            );
          }
        }
        return documents;
      }),
    );

    this.batchPromises.set(key, {
      promises: currentPromises,
      promise: batchPromise,
    });

    return batchPromise;
  }

  private invalidateBatchesContaining(documentId: string): void {
    for (const key of this.batchPromises.keys()) {
      if (key.split(",").includes(documentId)) {
        this.batchPromises.delete(key);
      }
    }
  }

  subscribe(id: string | string[], callback: () => void): () => void {
    const ids = Array.isArray(id) ? id : [id];

    for (const documentId of ids) {
      const listeners = this.listeners.get(documentId) ?? [];
      this.listeners.set(documentId, [...listeners, callback]);
    }

    return () => {
      for (const documentId of ids) {
        const listeners = this.listeners.get(documentId) ?? [];
        this.listeners.set(
          documentId,
          listeners.filter((listener) => listener !== callback),
        );
      }
    };
  }

  private notify(id: string): void {
    const listeners = this.listeners.get(id) ?? [];

    for (const listener of listeners) {
      listener();
    }
  }

  private async handleDocumentMutated(id: string) {
    this.invalidateBatchesContaining(id);
    await this.get(id);
    this.notify(id);
  }

  private handleDocumentDeleted(id: string) {
    this.documents.delete(id);
    this.invalidateBatchesContaining(id);
    this.notify(id);
  }

  private handleDocumentsDeleted(ids: string[]) {
    forEach(ids, (id) => this.handleDocumentDeleted(id));
  }
}
