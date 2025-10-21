import type { Operation, PHDocument } from "document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KyselyWriteCache } from "../../src/cache/kysely-write-cache.js";
import type { WriteCacheConfig } from "../../src/cache/types.js";
import type { IDocumentModelRegistry } from "../../src/registry/interfaces.js";
import type {
  IKeyframeStore,
  IOperationStore,
} from "../../src/storage/interfaces.js";
import { createTestOperation, createTestOperationStore } from "../factories.js";

function createMockOperationStore(): IOperationStore {
  return {
    apply: vi.fn(),
    getSince: vi.fn(),
    getSinceId: vi.fn(),
    getRevisions: vi.fn(),
  };
}

function createMockKeyframeStore(): IKeyframeStore {
  return {
    putKeyframe: vi.fn().mockResolvedValue(undefined),
    findNearestKeyframe: vi.fn().mockResolvedValue(undefined),
    deleteKeyframes: vi.fn().mockResolvedValue(0),
  };
}

function createMockRegistry(): IDocumentModelRegistry {
  return {
    registerModules: vi.fn(),
    unregisterModules: vi.fn(),
    getModule: vi.fn(),
    getAllModules: vi.fn(),
    clear: vi.fn(),
  };
}

function createTestDocument(): PHDocument {
  const doc = documentModelDocumentModelModule.utils.createDocument();
  return doc;
}

describe("KyselyWriteCache", () => {
  let cache: KyselyWriteCache;
  let keyframeStore: IKeyframeStore;
  let operationStore: IOperationStore;
  let registry: IDocumentModelRegistry;
  let config: WriteCacheConfig;

  beforeEach(() => {
    keyframeStore = createMockKeyframeStore();
    operationStore = createMockOperationStore();
    registry = createMockRegistry();
    config = {
      maxDocuments: 3,
      ringBufferSize: 5,
      keyframeInterval: 10,
    };
    cache = new KyselyWriteCache(
      keyframeStore,
      operationStore,
      registry,
      config,
    );
  });

  describe("putState and basic tracking", () => {
    it("should store and track documents", async () => {
      const doc1 = createTestDocument();

      cache.putState("doc1", "test/type", "global", "main", 1, doc1);

      const retrieved = await cache.getState(
        "doc1",
        "test/type",
        "global",
        "main",
        1,
      );

      expect(retrieved).toEqual(doc1);
    });

    it("should deep copy documents on put", () => {
      const doc = createTestDocument();
      const originalDoc = structuredClone(doc);

      cache.putState("doc1", "test/type", "global", "main", 1, doc);

      doc.state.document.version = "100";

      expect(doc.state.document.version).toBe("100");
      expect(originalDoc.state.document.version).not.toBe("100");
    });

    it("should evict LRU stream when at capacity", () => {
      const doc = createTestDocument();

      cache.putState("doc1", "test/type", "global", "main", 1, doc);
      cache.putState("doc2", "test/type", "global", "main", 1, doc);
      cache.putState("doc3", "test/type", "global", "main", 1, doc);

      // the LRU is set to capacity of 3, so doc1 should be evicted
      cache.putState("doc4", "test/type", "global", "main", 1, doc);

      // evicting the doc that has already been evicted should not evict anything
      const evicted = cache.invalidate("doc1", "global", "main");
      expect(evicted).toBe(0);
    });

    it("should maintain ring buffer per stream", () => {
      cache.putState(
        "doc1",
        "test/type",
        "global",
        "main",
        1,
        createTestDocument(),
      );
      cache.putState(
        "doc1",
        "test/type",
        "global",
        "main",
        2,
        createTestDocument(),
      );
      cache.putState(
        "doc1",
        "test/type",
        "global",
        "main",
        3,
        createTestDocument(),
      );
      cache.putState(
        "doc1",
        "test/type",
        "global",
        "main",
        4,
        createTestDocument(),
      );
      cache.putState(
        "doc1",
        "test/type",
        "global",
        "main",
        5,
        createTestDocument(),
      );
      cache.putState(
        "doc1",
        "test/type",
        "global",
        "main",
        6,
        createTestDocument(),
      );

      const stream = cache.getStream("doc1", "global", "main");
      expect(stream).toBeDefined();
      expect(stream?.ringBuffer.length).toBe(5);

      const snapshots = stream?.ringBuffer.getAll();
      expect(snapshots).toHaveLength(5);
      expect(snapshots?.[0].revision).toBe(2);
      expect(snapshots?.[1].revision).toBe(3);
      expect(snapshots?.[2].revision).toBe(4);
      expect(snapshots?.[3].revision).toBe(5);
      expect(snapshots?.[4].revision).toBe(6);
    });

    it("should handle multiple scopes/branches separately", () => {
      const doc = createTestDocument();

      cache.putState("doc1", "test/type", "global", "main", 1, doc);
      cache.putState("doc1", "test/type", "global", "feature", 1, doc);
      cache.putState("doc1", "test/type", "local", "main", 1, doc);

      const evicted = cache.invalidate("doc1");
      expect(evicted).toBe(3);
    });
  });

  describe("invalidate", () => {
    let cacheWithHigherCapacity: KyselyWriteCache;

    beforeEach(() => {
      const highCapacityConfig: WriteCacheConfig = {
        maxDocuments: 10,
        ringBufferSize: 5,
        keyframeInterval: 10,
      };
      cacheWithHigherCapacity = new KyselyWriteCache(
        keyframeStore,
        operationStore,
        registry,
        highCapacityConfig,
      );

      const doc = createTestDocument();
      cacheWithHigherCapacity.putState(
        "doc1",
        "test/type",
        "global",
        "main",
        1,
        doc,
      );
      cacheWithHigherCapacity.putState(
        "doc1",
        "test/type",
        "global",
        "feature",
        1,
        doc,
      );
      cacheWithHigherCapacity.putState(
        "doc1",
        "test/type",
        "local",
        "main",
        1,
        doc,
      );
      cacheWithHigherCapacity.putState(
        "doc2",
        "test/type",
        "global",
        "main",
        1,
        doc,
      );
    });

    it("should invalidate all streams for a document", () => {
      const evicted = cacheWithHigherCapacity.invalidate("doc1");
      expect(evicted).toBe(3);
    });

    it("should invalidate streams for specific scope", () => {
      const evicted = cacheWithHigherCapacity.invalidate("doc1", "global");
      expect(evicted).toBe(2);
    });

    it("should invalidate specific stream", () => {
      const evicted = cacheWithHigherCapacity.invalidate(
        "doc1",
        "global",
        "main",
      );
      expect(evicted).toBe(1);
    });

    it("should not double evict", () => {
      const evicted1 = cacheWithHigherCapacity.invalidate(
        "doc1",
        "global",
        "main",
      );
      expect(evicted1).toBe(1);

      const evicted2 = cacheWithHigherCapacity.invalidate(
        "doc1",
        "global",
        "main",
      );
      expect(evicted2).toBe(0);
    });

    it("should handle invalidate of non-existent stream", () => {
      const evicted = cacheWithHigherCapacity.invalidate(
        "non-existent",
        "global",
        "main",
      );
      expect(evicted).toBe(0);
    });
  });

  describe("clear", () => {
    it("should clear entire cache", () => {
      const doc = createTestDocument();
      cache.putState("doc1", "test/type", "global", "main", 1, doc);
      cache.putState("doc2", "test/type", "global", "main", 1, doc);

      cache.clear();

      const evicted = cache.invalidate("doc1", "global", "main");
      expect(evicted).toBe(0);
    });
  });

  describe("keyframe persistence", () => {
    it("should persist keyframes at interval boundaries", () => {
      const doc0 = createTestDocument();
      const doc2 = createTestDocument();
      const doc10 = createTestDocument();
      const doc20 = createTestDocument();

      cache.putState("doc1", "test/type", "global", "main", 0, doc0);
      cache.putState("doc1", "test/type", "global", "main", 2, doc2);
      cache.putState("doc1", "test/type", "global", "main", 10, doc10);
      cache.putState("doc1", "test/type", "global", "main", 20, doc20);

      expect(keyframeStore.putKeyframe).toHaveBeenCalledTimes(2);
      expect(keyframeStore.putKeyframe).toHaveBeenNthCalledWith(
        1,
        "doc1",
        "test/type",
        "global",
        "main",
        10,
        expect.objectContaining({
          state: expect.any(Object),
          header: expect.any(Object),
        }),
      );
      expect(keyframeStore.putKeyframe).toHaveBeenNthCalledWith(
        2,
        "doc1",
        "test/type",
        "global",
        "main",
        20,
        expect.objectContaining({
          state: expect.any(Object),
          header: expect.any(Object),
        }),
      );
    });

    it("should not persist non-keyframe revisions", () => {
      const doc5 = createTestDocument();
      const doc15 = createTestDocument();

      cache.putState("doc1", "test/type", "global", "main", 5, doc5);
      cache.putState("doc1", "test/type", "global", "main", 15, doc15);

      expect(keyframeStore.putKeyframe).not.toHaveBeenCalled();
    });

    it("should handle keyframe persistence errors gracefully", () => {
      const failingKeyframeStore = createMockKeyframeStore();
      failingKeyframeStore.putKeyframe = vi
        .fn()
        .mockRejectedValue(new Error("Storage error"));

      const failingCache = new KyselyWriteCache(
        failingKeyframeStore,
        operationStore,
        registry,
        config,
      );

      const doc10 = createTestDocument();

      expect(() => {
        failingCache.putState("doc1", "test/type", "global", "main", 10, doc10);
      }).not.toThrow();
    });
  });

  describe("startup and shutdown", () => {
    it("should handle startup", async () => {
      await expect(cache.startup()).resolves.toBeUndefined();
    });

    it("should handle shutdown", async () => {
      await expect(cache.shutdown()).resolves.toBeUndefined();
    });
  });

  describe("LRU eviction", () => {
    it("should evict least recently used stream", () => {
      const doc = createTestDocument();

      cache.putState("doc1", "test/type", "global", "main", 1, doc);
      cache.putState("doc2", "test/type", "global", "main", 1, doc);
      cache.putState("doc3", "test/type", "global", "main", 1, doc);

      // make doc1 the most recently used
      cache.putState("doc1", "test/type", "global", "main", 2, doc);

      // doc2 should be evicted now
      cache.putState("doc4", "test/type", "global", "main", 1, doc);

      const evicted = cache.invalidate("doc2", "global", "main");
      expect(evicted).toBe(0);
    });

    it("should update LRU on putState", () => {
      const doc = createTestDocument();

      cache.putState("doc1", "test/type", "global", "main", 1, doc);
      cache.putState("doc2", "test/type", "global", "main", 1, doc);
      cache.putState("doc3", "test/type", "global", "main", 1, doc);

      // make doc1 the most recently used
      cache.putState("doc1", "test/type", "global", "main", 2, doc);
      cache.putState("doc1", "test/type", "global", "main", 3, doc);

      // make doc4 the most recently used, which will evict doc2
      cache.putState("doc4", "test/type", "global", "main", 1, doc);

      // now evict doc1
      const evicted1 = cache.invalidate("doc1", "global", "main");
      expect(evicted1).toBe(1);

      const evicted2 = cache.invalidate("doc2", "global", "main");
      expect(evicted2).toBe(0);
    });
  });

  describe("getState - cache hit", () => {
    it("should return exact revision match on cache hit", async () => {
      const doc1 = createTestDocument();
      const doc2 = createTestDocument();
      const doc3 = createTestDocument();

      cache.putState("doc1", "test/type", "global", "main", 1, doc1);
      cache.putState("doc1", "test/type", "global", "main", 2, doc2);
      cache.putState("doc1", "test/type", "global", "main", 3, doc3);

      const retrieved = await cache.getState(
        "doc1",
        "test/type",
        "global",
        "main",
        2,
      );

      expect(retrieved).not.toBe(doc2);
      expect(retrieved).toEqual(doc2);
    });

    it("should return newest snapshot when targetRevision undefined", async () => {
      const doc1 = createTestDocument();
      const doc2 = createTestDocument();
      const doc3 = createTestDocument();

      cache.putState("doc1", "test/type", "global", "main", 1, doc1);
      cache.putState("doc1", "test/type", "global", "main", 2, doc2);
      cache.putState("doc1", "test/type", "global", "main", 3, doc3);

      const retrieved = await cache.getState(
        "doc1",
        "test/type",
        "global",
        "main",
      );

      expect(retrieved).not.toBe(doc3);
      expect(retrieved).toEqual(doc3);
    });

    it("should return deep copy (mutations don't affect cache)", async () => {
      const doc = createTestDocument();

      cache.putState("doc1", "test/type", "global", "main", 1, doc);

      const retrieved = await cache.getState(
        "doc1",
        "test/type",
        "global",
        "main",
        1,
      );

      retrieved.state.document.version = "100";

      const retrievedAgain = await cache.getState(
        "doc1",
        "test/type",
        "global",
        "main",
        1,
      );

      expect(retrievedAgain.state.document.version).not.toBe("100");
    });

    it("should update LRU on cache hit", async () => {
      const doc = createTestDocument();

      cache.putState("doc1", "test/type", "global", "main", 1, doc);
      cache.putState("doc2", "test/type", "global", "main", 1, doc);
      cache.putState("doc3", "test/type", "global", "main", 1, doc);

      await cache.getState("doc1", "test/type", "global", "main", 1);

      // this will evict doc2
      cache.putState("doc4", "test/type", "global", "main", 1, doc);

      const evicted1 = cache.invalidate("doc1", "global", "main");
      expect(evicted1).toBe(1);

      // already evicted
      const evicted2 = cache.invalidate("doc2", "global", "main");
      expect(evicted2).toBe(0);
    });

    it("should respect abort signal", async () => {
      const doc = createTestDocument();
      cache.putState("doc1", "test/type", "global", "main", 1, doc);

      const controller = new AbortController();
      controller.abort();

      await expect(
        cache.getState(
          "doc1",
          "test/type",
          "global",
          "main",
          1,
          controller.signal,
        ),
      ).rejects.toThrow("Operation aborted");
    });
  });
});

describe("KyselyWriteCache (Partial Integration) - Cold Miss Rebuild", () => {
  let keyframeStore: IKeyframeStore;
  let operationStore: IOperationStore;
  let registry: IDocumentModelRegistry;
  let cache: KyselyWriteCache;
  let config: WriteCacheConfig;
  let db: any;

  beforeEach(async () => {
    const opStoreSetup = await createTestOperationStore();
    operationStore = opStoreSetup.store;
    keyframeStore = opStoreSetup.keyframeStore;
    db = opStoreSetup.db;

    const mockRegistry = {
      registerModules: vi.fn(),
      unregisterModules: vi.fn(),
      getModule: vi.fn().mockReturnValue({
        reducer: (doc: PHDocument) => {
          return doc;
        },
        utils: documentModelDocumentModelModule.utils,
      }),
      getAllModules: vi.fn(),
      clear: vi.fn(),
    };

    registry = mockRegistry;

    config = {
      maxDocuments: 10,
      ringBufferSize: 5,
      keyframeInterval: 10,
    };
    cache = new KyselyWriteCache(
      keyframeStore,
      operationStore,
      registry,
      config,
    );
    await cache.startup();
  });

  afterEach(async () => {
    await cache.shutdown();
    if (db) {
      await db.destroy();
    }
  });

  it("should throw on rebuild failure", async () => {
    const mockGetSince = vi.fn().mockResolvedValue({
      items: [],
      nextCursor: undefined,
    });
    const mockOperationStore = {
      ...createMockOperationStore(),
      getSince: mockGetSince,
    };

    const mockRegistry = {
      ...createMockRegistry(),
      getModule: vi.fn().mockReturnValue({
        reducer: documentModelDocumentModelModule.reducer,
      }),
    };

    const testCache = new KyselyWriteCache(
      keyframeStore,
      mockOperationStore,
      mockRegistry,
      config,
    );

    await expect(
      testCache.getState("non-existent", "test/type", "global", "main", 1),
    ).rejects.toThrow("Failed to rebuild document non-existent");
  });

  it("should rebuild document from scratch on cold miss (no keyframe)", async () => {
    const docId = "test-doc-1";
    const docType = "powerhouse/document-model";

    const operations: Operation[] = [];
    for (let i = 1; i <= 5; i++) {
      operations.push(
        createTestOperation({
          id: `op-test-doc-1-${i}`,
          index: i,
          skip: 0,
        }),
      );
    }

    await operationStore.apply(docId, docType, "global", "main", 0, (txn) => {
      for (const op of operations) {
        txn.addOperations(op);
      }
    });

    const document = await cache.getState(docId, docType, "global", "main");

    expect(document).toEqual(createTestDocument());
    expect(document.state).toBeDefined();
  });

  it("should use keyframe if available (keyframe-accelerated rebuild)", async () => {
    const docId = "test-doc-2";
    const docType = "powerhouse/document-model";

    const operations: Operation[] = [];
    for (let i = 1; i <= 22; i++) {
      operations.push(
        createTestOperation({
          id: `op-test-doc-2-${i}`,
          index: i,
          skip: 0,
        }),
      );
    }

    await operationStore.apply(docId, docType, "global", "main", 0, (txn) => {
      for (const op of operations) {
        txn.addOperations(op);
      }
    });

    const doc20 = await cache.getState(docId, docType, "global", "main", 20);
    await keyframeStore.putKeyframe(
      docId,
      docType,
      "global",
      "main",
      20,
      doc20,
    );

    // now delete operations 1 - 20, this will prove that the keyframe is used
    await db
      .deleteFrom("Operation")
      .where("documentId", "=", docId)
      .where("index", "<", 21)
      .execute();

    cache.clear();

    const document = await cache.getState(docId, docType, "global", "main", 22);

    expect(document).toBeDefined();
    expect(document.state).toBeDefined();
  });

  it("should cache result after rebuild", async () => {
    const docId = "test-doc-3";
    const docType = "powerhouse/document-model";

    const operations: Operation[] = [];
    for (let i = 1; i <= 3; i++) {
      operations.push(
        createTestOperation({
          id: `op-test-doc-3-${i}`,
          index: i,
          skip: 0,
        }),
      );
    }

    await operationStore.apply(docId, docType, "global", "main", 0, (txn) => {
      for (const op of operations) {
        txn.addOperations(op);
      }
    });

    const streamBefore = cache.getStream(docId, "global", "main");
    expect(streamBefore).toBeUndefined();

    await cache.getState(docId, docType, "global", "main");

    const streamAfter = cache.getStream(docId, "global", "main");
    expect(streamAfter).toBeDefined();
    expect(streamAfter?.ringBuffer.length).toBe(1);

    const snapshots = streamAfter?.ringBuffer.getAll();
    expect(snapshots).toHaveLength(1);
    expect(snapshots?.[0].document).toBeDefined();
  });

  it("should handle abort signal during rebuild", async () => {
    const docId = "test-doc-4";
    const docType = "powerhouse/document-model";

    const operations: Operation[] = [];
    for (let i = 1; i <= 5; i++) {
      operations.push(
        createTestOperation({
          id: `op-test-doc-4-${i}`,
          index: i,
          skip: 0,
        }),
      );
    }

    await operationStore.apply(docId, docType, "global", "main", 0, (txn) => {
      for (const op of operations) {
        txn.addOperations(op);
      }
    });

    const controller = new AbortController();
    controller.abort();

    await expect(
      cache.getState(
        docId,
        docType,
        "global",
        "main",
        undefined,
        controller.signal,
      ),
    ).rejects.toThrow("Operation aborted");
  });
});

describe("KyselyWriteCache - Warm Miss Rebuild", () => {
  let keyframeStore: IKeyframeStore;
  let operationStore: IOperationStore;
  let registry: IDocumentModelRegistry;
  let cache: KyselyWriteCache;
  let config: WriteCacheConfig;
  let db: any;

  beforeEach(async () => {
    const opStoreSetup = await createTestOperationStore();
    operationStore = opStoreSetup.store;
    keyframeStore = opStoreSetup.keyframeStore;
    db = opStoreSetup.db;

    const mockRegistry = {
      registerModules: vi.fn(),
      unregisterModules: vi.fn(),
      getModule: vi.fn().mockReturnValue({
        reducer: (doc: PHDocument) => {
          return doc;
        },
        utils: documentModelDocumentModelModule.utils,
      }),
      getAllModules: vi.fn(),
      clear: vi.fn(),
    };

    registry = mockRegistry;

    config = {
      maxDocuments: 10,
      ringBufferSize: 5,
      keyframeInterval: 10,
    };
    cache = new KyselyWriteCache(
      keyframeStore,
      operationStore,
      registry,
      config,
    );
    await cache.startup();
  });

  afterEach(async () => {
    await cache.shutdown();
    if (db) {
      await db.destroy();
    }
  });

  it("should use cached base revision for warm miss", async () => {
    const docId = "test-warm-1";
    const docType = "powerhouse/document-model";

    const operations: Operation[] = [];
    for (let i = 1; i <= 20; i++) {
      operations.push(
        createTestOperation({
          id: `op-test-warm-1-${i}`,
          index: i,
          skip: 0,
        }),
      );
    }

    await operationStore.apply(docId, docType, "global", "main", 0, (txn) => {
      for (const op of operations) {
        txn.addOperations(op);
      }
    });

    const doc10 = await cache.getState(docId, docType, "global", "main", 10);
    expect(doc10).toBeDefined();

    const getSinceSpy = vi.spyOn(operationStore, "getSince");

    const doc15 = await cache.getState(docId, docType, "global", "main", 15);
    expect(doc15).toBeDefined();

    expect(getSinceSpy).toHaveBeenCalledWith(
      docId,
      "global",
      "main",
      10,
      undefined,
      undefined,
    );
  });

  it("should only load operations after base revision", async () => {
    const docId = "test-warm-2";
    const docType = "powerhouse/document-model";

    const operations: Operation[] = [];
    for (let i = 1; i <= 30; i++) {
      operations.push(
        createTestOperation({
          id: `op-test-warm-2-${i}`,
          index: i,
          skip: 0,
        }),
      );
    }

    await operationStore.apply(docId, docType, "global", "main", 0, (txn) => {
      for (const op of operations) {
        txn.addOperations(op);
      }
    });

    await cache.getState(docId, docType, "global", "main", 10);

    const getSinceSpy = vi.spyOn(operationStore, "getSince");

    await cache.getState(docId, docType, "global", "main", 20);

    expect(getSinceSpy).toHaveBeenCalledWith(
      docId,
      "global",
      "main",
      10,
      undefined,
      undefined,
    );

    const call = getSinceSpy.mock.calls[0];
    expect(call[3]).toBe(10);
  });

  it("should build to exact targetRevision", async () => {
    const docId = "test-warm-3";
    const docType = "powerhouse/document-model";

    const operations: Operation[] = [];
    for (let i = 1; i <= 25; i++) {
      operations.push(
        createTestOperation({
          id: `op-test-warm-3-${i}`,
          index: i,
          skip: 0,
        }),
      );
    }

    await operationStore.apply(docId, docType, "global", "main", 0, (txn) => {
      for (const op of operations) {
        txn.addOperations(op);
      }
    });

    await cache.getState(docId, docType, "global", "main", 10);

    const doc17 = await cache.getState(docId, docType, "global", "main", 17);
    expect(doc17).toBeDefined();
  });

  it("should cache result after warm rebuild", async () => {
    const docId = "test-warm-4";
    const docType = "powerhouse/document-model";

    const operations: Operation[] = [];
    for (let i = 1; i <= 20; i++) {
      operations.push(
        createTestOperation({
          id: `op-test-warm-4-${i}`,
          index: i,
          skip: 0,
        }),
      );
    }

    await operationStore.apply(docId, docType, "global", "main", 0, (txn) => {
      for (const op of operations) {
        txn.addOperations(op);
      }
    });

    await cache.getState(docId, docType, "global", "main", 10);

    const getSinceSpy = vi.spyOn(operationStore, "getSince");

    await cache.getState(docId, docType, "global", "main", 15);

    expect(getSinceSpy).toHaveBeenCalledTimes(1);

    await cache.getState(docId, docType, "global", "main", 15);

    expect(getSinceSpy).toHaveBeenCalledTimes(1);
  });

  it("should handle multiple revisions in ring buffer", async () => {
    const docId = "test-warm-5";
    const docType = "powerhouse/document-model";

    const operations: Operation[] = [];
    for (let i = 1; i <= 50; i++) {
      operations.push(
        createTestOperation({
          id: `op-test-warm-5-${i}`,
          index: i,
          skip: 0,
        }),
      );
    }

    await operationStore.apply(docId, docType, "global", "main", 0, (txn) => {
      for (const op of operations) {
        txn.addOperations(op);
      }
    });

    await cache.getState(docId, docType, "global", "main", 10);
    await cache.getState(docId, docType, "global", "main", 20);
    await cache.getState(docId, docType, "global", "main", 30);

    const getSinceSpy = vi.spyOn(operationStore, "getSince");

    await cache.getState(docId, docType, "global", "main", 35);

    expect(getSinceSpy).toHaveBeenCalledWith(
      docId,
      "global",
      "main",
      30,
      undefined,
      undefined,
    );
  });

  it("should choose nearest older revision as base", async () => {
    const docId = "test-warm-6";
    const docType = "powerhouse/document-model";

    const operations: Operation[] = [];
    for (let i = 1; i <= 100; i++) {
      operations.push(
        createTestOperation({
          id: `op-test-warm-6-${i}`,
          index: i,
          skip: 0,
        }),
      );
    }

    await operationStore.apply(docId, docType, "global", "main", 0, (txn) => {
      for (const op of operations) {
        txn.addOperations(op);
      }
    });

    await cache.getState(docId, docType, "global", "main", 10);
    await cache.getState(docId, docType, "global", "main", 30);
    await cache.getState(docId, docType, "global", "main", 50);
    await cache.getState(docId, docType, "global", "main", 70);

    const getSinceSpy = vi.spyOn(operationStore, "getSince");

    await cache.getState(docId, docType, "global", "main", 65);

    expect(getSinceSpy).toHaveBeenCalledWith(
      docId,
      "global",
      "main",
      50,
      undefined,
      undefined,
    );
  });

  it("should handle warm miss with abort signal", async () => {
    const docId = "test-warm-7";
    const docType = "powerhouse/document-model";

    const operations: Operation[] = [];
    for (let i = 1; i <= 20; i++) {
      operations.push(
        createTestOperation({
          id: `op-test-warm-7-${i}`,
          index: i,
          skip: 0,
        }),
      );
    }

    await operationStore.apply(docId, docType, "global", "main", 0, (txn) => {
      for (const op of operations) {
        txn.addOperations(op);
      }
    });

    await cache.getState(docId, docType, "global", "main", 10);

    const controller = new AbortController();
    controller.abort();

    await expect(
      cache.getState(docId, docType, "global", "main", 15, controller.signal),
    ).rejects.toThrow("Operation aborted");
  });
});
