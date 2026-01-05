import {
  driveDocumentModelModule,
  ReactorBuilder,
  type IDocumentDriveServer,
} from "document-drive";
import {
  documentModelDocumentModelModule,
  setName,
  type DocumentModelModule,
  type PHDocument,
} from "document-model";
import { describe, expect, it, vi } from "vitest";
import {
  addPromiseState,
  DocumentCache,
  readPromiseState,
} from "../src/document-cache.js";
import type {
  FulfilledPromise,
  IDocumentCache,
  PromiseWithState,
  RejectedPromise,
} from "../src/types/documents.js";

function createMockDocument(id: string, name = "Test Document"): PHDocument {
  const document = documentModelDocumentModelModule.utils.createDocument();
  document.header.id = id;
  document.header.name = name;
  return document;
}

async function createDocumentCache(
  documents: PHDocument[] = [],
): Promise<{ reactor: IDocumentDriveServer; cache: IDocumentCache }> {
  const legacyReactor = new ReactorBuilder([
    driveDocumentModelModule,
    documentModelDocumentModelModule,
  ] as unknown as DocumentModelModule[]).build();

  for (const document of documents) {
    await legacyReactor.addDocument(document);
  }
  return {
    reactor: legacyReactor,
    cache: new DocumentCache(legacyReactor),
  };
}

describe("readPromiseState", () => {
  it("should return pending for uninitialized promise", () => {
    const promise = addPromiseState(new Promise<string>(() => {}));
    const state = readPromiseState(promise);
    expect(state.status).toBe("pending");
    expect(promise.status).toBe("pending");
  });

  it("should return fulfilled with value for resolved promise", async () => {
    const promise = addPromiseState(Promise.resolve("test-value"));

    // Initialize tracking
    readPromiseState(promise);

    // Wait for promise to settle
    await promise;

    const state = readPromiseState(promise);

    expect(state.status).toBe("fulfilled");
    expect(promise.status).toBe("fulfilled");
    expect((promise as FulfilledPromise<string>).value).toBe("test-value");
    if (state.status === "fulfilled") {
      expect(state.value).toBe("test-value");
    }
  });

  it("should return rejected with reason for rejected promise", async () => {
    const error = new Error("test error");
    let rejectFn: (reason: Error) => void;
    const promise = addPromiseState(
      new Promise<string>((_, reject) => {
        rejectFn = reject;
      }),
    );

    // Suppress unhandled rejection from readPromiseState's re-throw
    const handler = (e: PromiseRejectionEvent) => {
      if ((e.reason as Error)?.message === "test error") e.preventDefault();
    };
    window.addEventListener("unhandledrejection", handler);

    // Attach catch handler before rejecting
    const catchPromise = promise.catch(() => {});

    // Initialize tracking
    readPromiseState(promise);

    // Reject the promise
    rejectFn!(error);

    // Wait for promise to settle
    await catchPromise;
    // Wait for readPromiseState's internal handler to complete
    await new Promise((resolve) => setTimeout(resolve, 0));

    const state = readPromiseState(promise);

    expect(state.status).toBe("rejected");
    expect(promise.status).toBe("rejected");
    expect((promise as RejectedPromise<string>).reason).toBe(error);
    if (state.status === "rejected") {
      expect(state.reason).toBe(error);
    }

    // Wait for async re-throw from readPromiseState
    await new Promise((resolve) => setTimeout(resolve, 10));
    window.removeEventListener("unhandledrejection", handler);
  });

  it("should track state transition from pending to fulfilled", async () => {
    let resolve: (value: string) => void;
    const promise = addPromiseState(
      new Promise<string>((r) => {
        resolve = r;
      }),
    );

    // Initially pending
    const pendingState = readPromiseState(promise);
    expect(pendingState.status).toBe("pending");

    // Resolve the promise
    resolve!("resolved-value");
    await promise;

    // Now fulfilled
    const fulfilledState = readPromiseState(promise);
    expect(fulfilledState.status).toBe("fulfilled");
    if (fulfilledState.status === "fulfilled") {
      expect(fulfilledState.value).toBe("resolved-value");
    }
  });

  it("should track state transition from pending to rejected", async () => {
    let reject: (reason: Error) => void;
    const promise = addPromiseState(
      new Promise<string>((_, r) => {
        reject = r;
      }),
    );

    // Suppress unhandled rejection from readPromiseState's re-throw
    const error = new Error("rejection reason");
    const handler = (e: PromiseRejectionEvent) => {
      if ((e.reason as Error)?.message === "rejection reason")
        e.preventDefault();
    };
    window.addEventListener("unhandledrejection", handler);

    // Attach catch handler before rejecting
    const catchPromise = promise.catch(() => {});

    // Initially pending
    const pendingState = readPromiseState(promise);
    expect(pendingState.status).toBe("pending");

    // Reject the promise
    reject!(error);
    await catchPromise;
    // Wait for readPromiseState's internal handler to complete
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Now rejected
    const rejectedState = readPromiseState(promise);
    expect(rejectedState.status).toBe("rejected");
    if (rejectedState.status === "rejected") {
      expect(rejectedState.reason).toBe(error);
    }

    // Wait for async re-throw from readPromiseState
    await new Promise((resolve) => setTimeout(resolve, 10));
    window.removeEventListener("unhandledrejection", handler);
  });

  it("should return same state on subsequent calls for already tracked promise", async () => {
    const promise = addPromiseState(Promise.resolve("value"));

    readPromiseState(promise);
    await promise;

    const state1 = readPromiseState(promise);
    const state2 = readPromiseState(promise);

    expect(state1).toEqual(state2);
  });
});

describe("DocumentCache class", () => {
  describe("get method", () => {
    it("should call reactor.getDocument when getting document", async () => {
      const doc = createMockDocument("test");
      const { reactor, cache } = await createDocumentCache([doc]);
      const spy = vi.spyOn(reactor, "getDocument");
      const documentP = cache.get("test");

      expect(spy).toHaveBeenCalledWith("test");
      await expect(documentP).resolves.toEqual(doc);
    });

    it("should deduplicate requests while promise is pending", async () => {
      const doc = createMockDocument("test");
      const { reactor, cache } = await createDocumentCache([doc]);
      const spy = vi.spyOn(reactor, "getDocument");

      const promise1 = cache.get("test");
      const promise2 = cache.get("test");
      const promise3 = cache.get("test");

      expect(promise1).toBe(promise2);
      expect(promise2).toBe(promise3);
      expect(spy).toHaveBeenCalledTimes(1);

      const [result1, result2, result3] = await Promise.all([
        promise1,
        promise2,
        promise3,
      ]);
      expect(result1).toBe(result2);
      expect(result2).toBe(result3);
    });

    it("should return cached fulfilled promise when refetch is false", async () => {
      const doc = createMockDocument("test");
      const { reactor, cache } = await createDocumentCache([doc]);
      const spy = vi.spyOn(reactor, "getDocument");

      const promise1 = cache.get("test");
      await promise1;

      const promise2 = cache.get("test", false);

      expect(promise1).toBe(promise2);
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it("should refetch when refetch is true even for fulfilled promise", async () => {
      const doc = createMockDocument("test");
      const { reactor, cache } = await createDocumentCache([doc]);
      const spy = vi.spyOn(reactor, "getDocument");

      const promise1 = cache.get("test");
      // Initialize state tracking before awaiting
      readPromiseState(promise1 as PromiseWithState<PHDocument>);
      await promise1;
      // Allow microtask to update promise status to "fulfilled"
      await new Promise((resolve) => setTimeout(resolve, 0));

      const promise2 = cache.get("test", true);

      expect(promise1).not.toBe(promise2);
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it("should handle non-existent document", async () => {
      const { cache } = await createDocumentCache([]);

      // Suppress unhandled rejection from readPromiseState's re-throw
      const handler = (e: PromiseRejectionEvent) => {
        if ((e.reason as Error)?.message?.includes("non-existent"))
          e.preventDefault();
      };
      window.addEventListener("unhandledrejection", handler);

      await expect(cache.get("non-existent")).rejects.toThrow();

      // Wait for async re-throw from readPromiseState
      await new Promise((resolve) => setTimeout(resolve, 10));
      window.removeEventListener("unhandledrejection", handler);
    });
  });

  describe("getBatch method", () => {
    it("should return a promise that resolves to an array of documents", async () => {
      const doc1 = createMockDocument("doc-1", "Document 1");
      const doc2 = createMockDocument("doc-2", "Document 2");
      const { cache } = await createDocumentCache([doc1, doc2]);

      const docs = await cache.getBatch(["doc-1", "doc-2"]);

      expect(docs).toHaveLength(2);
      expect(docs[0].header.name).toBe("Document 1");
      expect(docs[1].header.name).toBe("Document 2");
    });

    it("should cache batch promises by key", async () => {
      const doc1 = createMockDocument("doc-1");
      const doc2 = createMockDocument("doc-2");
      const { cache } = await createDocumentCache([doc1, doc2]);

      const promise1 = cache.getBatch(["doc-1", "doc-2"]);
      await promise1;
      const promise2 = cache.getBatch(["doc-1", "doc-2"]);

      expect(promise1).toBe(promise2);
    });

    it("should return different batch for different id order", async () => {
      const doc1 = createMockDocument("doc-1");
      const doc2 = createMockDocument("doc-2");
      const { cache } = await createDocumentCache([doc1, doc2]);

      const promise1 = cache.getBatch(["doc-1", "doc-2"]);
      await promise1;
      const promise2 = cache.getBatch(["doc-2", "doc-1"]);

      expect(promise1).not.toBe(promise2);
    });

    it("should create pre-resolved batch when all promises are fulfilled", async () => {
      const doc1 = createMockDocument("doc-1");
      const doc2 = createMockDocument("doc-2");
      const { cache } = await createDocumentCache([doc1, doc2]);

      // Fetch individual documents and initialize state tracking
      const p1 = cache.get("doc-1");
      const p2 = cache.get("doc-2");
      readPromiseState(p1 as PromiseWithState<PHDocument>);
      readPromiseState(p2 as PromiseWithState<PHDocument>);
      await Promise.all([p1, p2]);
      // Allow microtask to update promise statuses to "fulfilled"
      await new Promise((resolve) => setTimeout(resolve, 0));

      const batchPromise = cache.getBatch([
        "doc-1",
        "doc-2",
      ]) as PromiseWithState<PHDocument[]>;

      // Should be pre-resolved (status already set)
      expect(batchPromise.status).toBe("fulfilled");
      expect(
        (batchPromise as FulfilledPromise<PHDocument[]>).value,
      ).toBeDefined();
      expect(
        (batchPromise as FulfilledPromise<PHDocument[]>).value,
      ).toHaveLength(2);
    });

    it("should return empty batch for empty ids array", async () => {
      const { cache } = await createDocumentCache([]);

      const docs = await cache.getBatch([]);

      expect(docs).toEqual([]);
    });

    it("should reject when one document does not exist", async () => {
      const doc1 = createMockDocument("doc-1");
      const { cache } = await createDocumentCache([doc1]);

      // Suppress unhandled rejection from readPromiseState's re-throw
      const handler = (e: PromiseRejectionEvent) => {
        if ((e.reason as Error)?.message?.includes("non-existent"))
          e.preventDefault();
      };
      window.addEventListener("unhandledrejection", handler);

      await expect(cache.getBatch(["doc-1", "non-existent"])).rejects.toThrow();

      // Wait for async re-throw from readPromiseState
      await new Promise((resolve) => setTimeout(resolve, 10));
      window.removeEventListener("unhandledrejection", handler);
    });

    it("should not return stale data when a document has been deleted", async () => {
      const doc1 = createMockDocument("doc-1", "Document 1");
      const doc2 = createMockDocument("doc-2", "Document 2");
      const { reactor, cache } = await createDocumentCache([doc1, doc2]);

      // Suppress unhandled rejection from readPromiseState's re-throw
      const handler = (e: PromiseRejectionEvent) => {
        if ((e.reason as Error)?.message?.includes("doc-2")) e.preventDefault();
      };
      window.addEventListener("unhandledrejection", handler);

      // Fetch batch initially to cache it
      const initialBatch = await cache.getBatch(["doc-1", "doc-2"]);
      expect(initialBatch).toHaveLength(2);
      expect(initialBatch[0].header.name).toBe("Document 1");
      expect(initialBatch[1].header.name).toBe("Document 2");

      // Delete one document (this triggers documentDeleted event which removes it from cache)
      await reactor.deleteDocument(doc2.header.id);

      // Subsequent batch request should detect the deletion and create a new batch
      // that will fail (not return stale data)
      await expect(cache.getBatch(["doc-1", "doc-2"])).rejects.toThrow();

      // Wait for async re-throw from readPromiseState
      await new Promise((resolve) => setTimeout(resolve, 10));
      window.removeEventListener("unhandledrejection", handler);
    });

    it("should invalidate batch cache when a document is deleted", async () => {
      const doc1 = createMockDocument("doc-1", "Document 1");
      const doc2 = createMockDocument("doc-2", "Document 2");
      const doc3 = createMockDocument("doc-3", "Document 3");
      const { reactor, cache } = await createDocumentCache([doc1, doc2, doc3]);

      // Suppress unhandled rejection from readPromiseState's re-throw
      const handler = (e: PromiseRejectionEvent) => {
        if ((e.reason as Error)?.message?.includes("doc-2")) e.preventDefault();
      };
      window.addEventListener("unhandledrejection", handler);

      // Fetch two different batches to cache them
      const batch1 = cache.getBatch(["doc-1", "doc-2"]);
      const batch2 = cache.getBatch(["doc-2", "doc-3"]);
      await Promise.all([batch1, batch2]);

      // Both batches should be cached (same reference on subsequent calls)
      expect(cache.getBatch(["doc-1", "doc-2"])).toBe(batch1);
      expect(cache.getBatch(["doc-2", "doc-3"])).toBe(batch2);

      // Delete doc-2 (should invalidate both batches that contain it)
      await reactor.deleteDocument(doc2.header.id);

      // Batch that only contained doc-1 and doc-3 should still work
      const batch3 = cache.getBatch(["doc-1", "doc-3"]);
      await expect(batch3).resolves.toHaveLength(2);

      // Batches containing deleted doc-2 should be invalidated (new promise, will fail)
      const newBatch1 = cache.getBatch(["doc-1", "doc-2"]);
      const newBatch2 = cache.getBatch(["doc-2", "doc-3"]);
      expect(newBatch1).not.toBe(batch1);
      expect(newBatch2).not.toBe(batch2);
      await expect(newBatch1).rejects.toThrow();
      await expect(newBatch2).rejects.toThrow();

      // Wait for async re-throw from readPromiseState
      await new Promise((resolve) => setTimeout(resolve, 10));
      window.removeEventListener("unhandledrejection", handler);
    });
  });

  describe("subscribe method", () => {
    it("should add listener for single id", async () => {
      const doc = createMockDocument("test");
      const { cache } = await createDocumentCache([doc]);
      const callback = vi.fn();

      cache.subscribe("test", callback);

      // Callback is not immediately called
      expect(callback).not.toHaveBeenCalled();
    });

    it("should add listener for multiple ids", async () => {
      const doc1 = createMockDocument("doc-1");
      const doc2 = createMockDocument("doc-2");
      const { cache } = await createDocumentCache([doc1, doc2]);
      const callback = vi.fn();

      cache.subscribe(["doc-1", "doc-2"], callback);

      // Callback is not immediately called
      expect(callback).not.toHaveBeenCalled();
    });

    it("should return unsubscribe function", async () => {
      const doc = createMockDocument("test");
      const { cache } = await createDocumentCache([doc]);
      const callback = vi.fn();

      const unsubscribe = cache.subscribe("test", callback);

      expect(typeof unsubscribe).toBe("function");
    });

    it("should allow multiple subscriptions to same id", async () => {
      const doc = createMockDocument("test");
      const { cache } = await createDocumentCache([doc]);
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      cache.subscribe("test", callback1);
      cache.subscribe("test", callback2);

      // Both subscriptions should be registered without error
      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).not.toHaveBeenCalled();
    });
  });

  describe("event handling", () => {
    it("should notify listeners when operationsAdded event is emitted", async () => {
      const doc = createMockDocument("test", "Original Name");
      const { reactor, cache } = await createDocumentCache([doc]);
      const callback = vi.fn();

      // First, get the document to add it to the cache
      await cache.get("test");

      // Subscribe to changes
      cache.subscribe("test", callback);

      // Add an operation to trigger the event
      await reactor.addAction(doc.header.id, setName("Updated Name"));

      // Wait for the callback to be called
      await vi.waitFor(() => {
        expect(callback).toHaveBeenCalled();
      });
    });

    it("should remove document from cache when documentDeleted event is emitted", async () => {
      const doc = createMockDocument("test");
      const { reactor, cache } = await createDocumentCache([doc]);

      // Get the document to add it to cache
      await cache.get("test");

      // Delete the document
      await reactor.deleteDocument(doc.header.id);

      // Trying to get the deleted document should fail
      await expect(cache.get("test")).rejects.toThrow();
    });

    it("should notify listeners when documentDeleted event is emitted", async () => {
      const doc = createMockDocument("test");
      const { reactor, cache } = await createDocumentCache([doc]);
      const callback = vi.fn();

      // Get the document to add it to cache
      await cache.get("test");

      // Subscribe to changes
      cache.subscribe("test", callback);

      // Delete the document
      await reactor.deleteDocument(doc.header.id);

      // Callback should be called
      expect(callback).toHaveBeenCalled();
    });

    it("should not notify listeners for documents not in cache on operationsAdded", async () => {
      const doc = createMockDocument("test");
      const { reactor, cache } = await createDocumentCache([doc]);
      const callback = vi.fn();

      // Subscribe without getting the document first
      cache.subscribe("test", callback);

      // Add an operation
      await reactor.addAction(doc.header.id, setName("Updated Name"));

      // Wait a bit to ensure no callback is triggered
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Callback should not be called because document wasn't in cache
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe("stale-while-revalidate behavior", () => {
    it("should return stale data while refetch is triggered by operationsAdded", async () => {
      const doc = createMockDocument("test", "Original Name");
      const { reactor, cache } = await createDocumentCache([doc]);

      // Get document initially and track state
      const initialPromise = cache.get("test");
      readPromiseState(initialPromise as PromiseWithState<PHDocument>);
      const initialDoc = await initialPromise;
      expect(initialDoc.header.name).toBe("Original Name");
      // Allow microtask to update promise status to "fulfilled"
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Trigger update which will refetch
      const actionPromise = reactor.addAction(
        doc.header.id,
        setName("Updated Name"),
      );

      // While update is being processed, get() should still return the old data
      expect(cache.get("test")).toBe(initialPromise);

      await actionPromise;

      // After operationsAdded completes, get() should return the updated data
      expect(cache.get("test")).not.toBe(initialPromise);
      const updatedDoc = await cache.get("test");
      expect(updatedDoc.header.name).toBe("Updated Name");
    });

    it("should return stale batch data while refetch is in progress", async () => {
      const doc1 = createMockDocument("doc-1", "Doc 1");
      const doc2 = createMockDocument("doc-2", "Doc 2");
      const { reactor, cache } = await createDocumentCache([doc1, doc2]);

      // Get initial batch
      const initialBatch = await cache.getBatch(["doc-1", "doc-2"]);
      expect(initialBatch[0].header.name).toBe("Doc 1");

      // Trigger update which starts a refetch
      await reactor.addAction(doc1.header.id, setName("Updated Doc 1"));

      // During refetch, getBatch should still return data (possibly stale)
      const duringRefetchBatch = await cache.getBatch(["doc-1", "doc-2"]);
      expect(duringRefetchBatch).toBeDefined();
      expect(duringRefetchBatch).toHaveLength(2);
    });
  });
});
