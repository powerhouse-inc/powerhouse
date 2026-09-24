import type { PHDocument } from "@powerhousedao/shared/document-model";
import type {
  DocumentRefetchState,
  FulfilledPromise,
  PromiseWithState,
  RejectedPromise,
} from "./types/documents.js";

/** The refetch snapshot of a document with nothing in flight and no kept failure. */
export const IDLE_REFETCH_STATE: DocumentRefetchState = Object.freeze({
  isRefetching: false,
  error: undefined,
});

function fulfilledPromise<T>(value: T): FulfilledPromise<T> {
  const promise = Promise.resolve(value) as FulfilledPromise<T>;
  promise.status = "fulfilled";
  promise.value = value;
  return promise;
}

function rejectedPromise<T>(reason: unknown): RejectedPromise<T> {
  const promise = Promise.reject(reason as Error) as RejectedPromise<T>;
  promise.status = "rejected";
  promise.reason = reason;
  // Readers get the reason from `status`; the refetch caller gets the rejection.
  promise.catch(() => undefined);
  return promise;
}

const MISSING_DOCUMENT_ERRORS = [
  "DocumentNotFoundError",
  "DocumentDeletedError",
];

// The document is gone, so its last loaded state must not stay on screen.
// The document view and GraphQL client throw a plain "Document not found" Error.
export function isMissingDocumentError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    MISSING_DOCUMENT_ERRORS.includes(error.name) ||
    error.message.startsWith("Document not found")
  );
}

const noop = () => undefined;

/** One refetch running per cache key, and at most one queued behind it. */
type Refetch = {
  running: Promise<PHDocument> | undefined;
  queued: Promise<PHDocument> | undefined;
};

export type DocumentRefetcherHost = {
  /** The cache's stored promises; an entry is replaced only once its refetch settles. */
  documents: Map<string, PromiseWithState<PHDocument>>;
  fetch(id: string): Promise<PHDocument>;
  notify(id: string): void;
  onFetched?(id: string, document: PHDocument): void;
};

/** Background refetch of loaded documents: readers keep the loaded promise until it settles. */
export class DocumentRefetcher {
  private refetches = new Map<string, Refetch>();
  private states = new Map<string, DocumentRefetchState>();

  constructor(private readonly host: DocumentRefetcherHost) {}

  getState(id: string): DocumentRefetchState {
    return this.states.get(id) ?? IDLE_REFETCH_STATE;
  }

  /** Serializes refetches per key: one runs, later requests share one queued run. */
  refetch(id: string): Promise<PHDocument> {
    let entry = this.refetches.get(id);
    if (!entry) {
      entry = { running: undefined, queued: undefined };
      this.refetches.set(id, entry);
      const current = this.host.documents.get(id);
      if (current?.status !== "pending") {
        return this.start(id, entry);
      }
      // A pending first load may predate the change, so refetch after it.
      entry.running = current;
    }
    const inFlight = entry;
    inFlight.queued ??= (inFlight.running ?? Promise.resolve())
      .then(noop, noop)
      .then(() => this.start(id, inFlight));
    return inFlight.queued;
  }

  /** Stops any refetch of `id` from writing back, e.g. on deletion. */
  forget(id: string): void {
    this.refetches.delete(id);
    this.states.delete(id);
  }

  clear(): void {
    this.refetches.clear();
    this.states.clear();
  }

  private start(id: string, entry: Refetch): Promise<PHDocument> {
    entry.queued = undefined;
    entry.running = this.run(id, entry);
    return entry.running;
  }

  private async run(id: string, entry: Refetch): Promise<PHDocument> {
    const isCurrent = () => this.refetches.get(id) === entry;
    // Superseded: answer the caller without touching the cache.
    if (!isCurrent()) {
      return this.host.fetch(id);
    }
    const started = this.setState(id, {
      isRefetching: true,
      error: this.getState(id).error,
    });
    if (started) {
      this.host.notify(id);
    }
    try {
      const document = await this.host.fetch(id);
      if (isCurrent()) {
        this.host.onFetched?.(id, document);
        this.host.documents.set(id, fulfilledPromise(document));
        this.finish(id, entry, undefined);
      }
      return document;
    } catch (error) {
      if (isCurrent()) {
        if (isMissingDocumentError(error)) {
          this.host.documents.set(id, rejectedPromise(error));
          this.finish(id, entry, undefined);
        } else {
          console.warn(
            "[DocumentCache] Refetch failed; keeping the loaded document:",
            error,
          );
          this.finish(id, entry, error);
        }
      }
      throw error;
    }
  }

  private finish(id: string, entry: Refetch, error: unknown): void {
    if (!entry.queued) {
      this.refetches.delete(id);
    }
    this.setState(id, { isRefetching: entry.queued !== undefined, error });
    this.host.notify(id);
  }

  /** Returns whether the snapshot changed; the caller notifies. */
  private setState(id: string, state: DocumentRefetchState): boolean {
    const current = this.getState(id);
    if (
      current.isRefetching === state.isRefetching &&
      current.error === state.error
    ) {
      return false;
    }
    if (!state.isRefetching && state.error === undefined) {
      this.states.delete(id);
    } else {
      this.states.set(id, Object.freeze({ ...state }));
    }
    return true;
  }
}
