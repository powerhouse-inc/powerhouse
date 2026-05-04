import {
  addPromiseState,
  phDocumentFromQuery,
  readPromiseState,
  type FulfilledPromise,
  type IDocumentCache,
  type PromiseWithState,
  type ReactorGraphQLClient,
} from "@powerhousedao/reactor-browser";
import type { PHDocument } from "document-model";
import {
  filter,
  forEach,
  isTruthy,
  map,
  mapToObj,
  pipe,
  prop,
  unique,
} from "remeda";
import { batch, type Batch } from "./batch.js";

function makeDocumentsById(documents: (PHDocument | undefined)[] = []) {
  return pipe(
    documents,
    filter(isTruthy),
    mapToObj((document) => [document.header.id, document]),
  );
}

class DocumentFetcher {
  private batchGetDocuments: Batch<[id: string], PHDocument>;

  constructor(client: ReactorGraphQLClient) {
    this.batchGetDocuments = batch(
      async (requests: readonly [id: string][]) => {
        const ids = unique(map(requests, ([id]) => id));
        const documents = await batchFetchDocuments(client, ids);

        return makeDocumentsById(documents);
      },
      (documentsById, _, id) => {
        const document = prop(documentsById, id);
        return document;
      },
    );
  }

  get(id: string): Promise<PHDocument> {
    return this.batchGetDocuments.call(id);
  }

  getBatch(ids: string[]): Promise<PHDocument[]> {
    return Promise.all(map(ids, (id) => this.get(id)));
  }
}

async function fetchDocument(client: ReactorGraphQLClient, identifier: string) {
  try {
    const result = await client.GetDocument({
      identifier,
    });
    const document = result.document?.document;
    if (!document) return undefined;
    return phDocumentFromQuery(document);
  } catch (error) {
    return undefined;
  }
}

async function batchFetchDocuments(
  client: ReactorGraphQLClient,
  identifiers: readonly string[],
) {
  const promises = map(identifiers, (identifier) =>
    fetchDocument(client, identifier),
  );
  return await Promise.all(promises);
}

export class Cache implements IDocumentCache {
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

  constructor(client: ReactorGraphQLClient) {
    this.fetcher = new DocumentFetcher(client);

    window.addEventListener("MutateDocument", (event) => {
      console.log(event);
      this.handleDocumentMutated(event.detail.documentIdentifier).catch(console.error);
    });

    window.addEventListener("MutateDocumentAsync", (event) => {
      console.log(event);
      this.handleDocumentMutated(event.detail.documentIdentifier).catch(console.error);
    });

    window.addEventListener("DeleteDocument", (event) => {
      this.handleDocumentDeleted(event.detail.identifier);
    });

    window.addEventListener("DeleteDocuments", (event) => {
      this.handleDocumentsDeleted(event.detail.identifiers);
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

    const allFulfilled = states.every((state) => state.status === "fulfilled");

    if (allFulfilled) {
      const values = states.map(
        (state) => (state as { status: "fulfilled"; value: PHDocument }).value,
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

    const batchPromise = addPromiseState(Promise.all(currentPromises));

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
      console.log("[cache subscribe]", documentId);

      const listeners = this.listeners.get(documentId) ?? [];
      this.listeners.set(documentId, [...listeners, callback]);
    }

    return () => {
      for (const documentId of ids) {
        console.log("[cache unsubscribe]", documentId);

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

    console.log("[cache notify]", {
      id,
      listenerCount: listeners.length,
      promise: this.documents.get(id),
      status: this.documents.get(id)?.status,
    });

    for (const listener of listeners) {
      listener();
    }
  }

  private async handleDocumentMutated(id: string) {
    this.invalidateBatchesContaining(id);
    await this.get(id, true);
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
