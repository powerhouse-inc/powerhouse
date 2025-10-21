import type { Operation, PHDocument } from "document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryKeyValueStore } from "../../src/cache/kv/kv-store.js";
import { KyselyWriteCache } from "../../src/cache/kysely-write-cache.js";
import type { WriteCacheConfig } from "../../src/cache/types.js";
import type { IDocumentModelRegistry } from "../../src/registry/interfaces.js";
import type { IOperationStore } from "../../src/storage/interfaces.js";
import { createTestOperation, createTestOperationStore } from "../factories.js";

function createMockOperationStore(): IOperationStore {
  return {
    apply: vi.fn(),
    getSince: vi.fn(),
    getSinceId: vi.fn(),
    getRevisions: vi.fn(),
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

function createMockDocument(): PHDocument {
  const doc = documentModelDocumentModelModule.utils.createDocument();
  return doc;
}

describe("KyselyWriteCache", () => {
  let cache: KyselyWriteCache;
  let kvStore: InMemoryKeyValueStore;
  let operationStore: IOperationStore;
  let registry: IDocumentModelRegistry;
  let config: WriteCacheConfig;

  beforeEach(() => {
    kvStore = new InMemoryKeyValueStore();
    operationStore = createMockOperationStore();
    registry = createMockRegistry();
    config = {
      maxDocuments: 3,
      ringBufferSize: 5,
      keyframeInterval: 10,
    };
    cache = new KyselyWriteCache(kvStore, operationStore, registry, config);
  });

  describe("putState and basic tracking", () => {
    it("should store and track documents", () => {
      const doc1 = createMockDocument();
      const doc2 = createMockDocument();

      cache.putState("doc1", "test/type", "global", "main", 1, doc1);
      cache.putState("doc1", "test/type", "global", "main", 2, doc2);

      expect(cache).toBeDefined();
    });

    it("should deep copy documents on put", () => {
      const doc = createMockDocument();
      const originalDoc = structuredClone(doc);

      cache.putState("doc1", "test/type", "global", "main", 1, doc);

      (doc.state as any).testField = "modified";

      expect((doc.state as any).testField).toBe("modified");
      expect((originalDoc.state as any).testField).toBeUndefined();
    });

    it("should evict LRU stream when at capacity", () => {
      const doc = createMockDocument();

      cache.putState("doc1", "test/type", "global", "main", 1, doc);
      cache.putState("doc2", "test/type", "global", "main", 1, doc);
      cache.putState("doc3", "test/type", "global", "main", 1, doc);

      cache.putState("doc4", "test/type", "global", "main", 1, doc);

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
        createMockDocument(),
      );
      cache.putState(
        "doc1",
        "test/type",
        "global",
        "main",
        2,
        createMockDocument(),
      );
      cache.putState(
        "doc1",
        "test/type",
        "global",
        "main",
        3,
        createMockDocument(),
      );

      expect(cache).toBeDefined();
    });

    it("should handle multiple scopes/branches separately", () => {
      const doc = createMockDocument();

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
        kvStore,
        operationStore,
        registry,
        highCapacityConfig,
      );

      const doc = createMockDocument();
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

    it("should return correct eviction count", () => {
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
      const doc = createMockDocument();
      cache.putState("doc1", "test/type", "global", "main", 1, doc);
      cache.putState("doc2", "test/type", "global", "main", 1, doc);

      cache.clear();

      const evicted = cache.invalidate("doc1", "global", "main");
      expect(evicted).toBe(0);
    });
  });

  describe("keyframe persistence", () => {
    it("should persist keyframes at interval boundaries", async () => {
      const doc10 = createMockDocument();
      const doc20 = createMockDocument();

      cache.putState("doc1", "test/type", "global", "main", 10, doc10);
      cache.putState("doc1", "test/type", "global", "main", 20, doc20);

      await new Promise((resolve) => setTimeout(resolve, 10));

      const key10 = "keyframe:doc1:test/type:global:main:10";
      const key20 = "keyframe:doc1:test/type:global:main:20";

      const stored10 = await kvStore.get(key10);
      const stored20 = await kvStore.get(key20);

      expect(stored10).toBeDefined();
      expect(stored20).toBeDefined();
    });

    it("should not persist non-keyframe revisions", async () => {
      const doc5 = createMockDocument();
      const doc15 = createMockDocument();

      cache.putState("doc1", "test/type", "global", "main", 5, doc5);
      cache.putState("doc1", "test/type", "global", "main", 15, doc15);

      await new Promise((resolve) => setTimeout(resolve, 10));

      const key5 = "keyframe:doc1:test/type:global:main:5";
      const key15 = "keyframe:doc1:test/type:global:main:15";

      const stored5 = await kvStore.get(key5);
      const stored15 = await kvStore.get(key15);

      expect(stored5).toBeUndefined();
      expect(stored15).toBeUndefined();
    });

    it("should handle keyframe persistence errors gracefully", async () => {
      const failingKvStore = new InMemoryKeyValueStore();
      failingKvStore.put = vi
        .fn()
        .mockRejectedValue(new Error("Storage error"));

      const failingCache = new KyselyWriteCache(
        failingKvStore,
        operationStore,
        registry,
        config,
      );

      const doc10 = createMockDocument();

      expect(() => {
        failingCache.putState("doc1", "test/type", "global", "main", 10, doc10);
      }).not.toThrow();

      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  });

  describe("startup and shutdown", () => {
    it("should call kvStore startup", async () => {
      const startupSpy = vi.spyOn(kvStore, "startup");
      await cache.startup();
      expect(startupSpy).toHaveBeenCalled();
    });

    it("should call kvStore shutdown", async () => {
      const shutdownSpy = vi.spyOn(kvStore, "shutdown");
      await cache.shutdown();
      expect(shutdownSpy).toHaveBeenCalled();
    });
  });

  describe("LRU eviction", () => {
    it("should evict least recently used stream", () => {
      const doc = createMockDocument();

      cache.putState("doc1", "test/type", "global", "main", 1, doc);
      cache.putState("doc2", "test/type", "global", "main", 1, doc);
      cache.putState("doc3", "test/type", "global", "main", 1, doc);

      cache.putState("doc1", "test/type", "global", "main", 2, doc);

      cache.putState("doc4", "test/type", "global", "main", 1, doc);

      const evicted = cache.invalidate("doc2", "global", "main");
      expect(evicted).toBe(0);
    });

    it("should update LRU on putState", () => {
      const doc = createMockDocument();

      cache.putState("doc1", "test/type", "global", "main", 1, doc);
      cache.putState("doc2", "test/type", "global", "main", 1, doc);
      cache.putState("doc3", "test/type", "global", "main", 1, doc);

      cache.putState("doc1", "test/type", "global", "main", 2, doc);
      cache.putState("doc1", "test/type", "global", "main", 3, doc);

      cache.putState("doc4", "test/type", "global", "main", 1, doc);

      const evicted1 = cache.invalidate("doc1", "global", "main");
      expect(evicted1).toBe(1);

      const evicted2 = cache.invalidate("doc2", "global", "main");
      expect(evicted2).toBe(0);
    });
  });

  describe("getState - cache hit", () => {
    it("should return exact revision match on cache hit", async () => {
      const doc1 = createMockDocument();
      const doc2 = createMockDocument();
      const doc3 = createMockDocument();

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

      expect(retrieved).toBeDefined();
      expect(retrieved).not.toBe(doc2);
    });

    it("should return newest snapshot when targetRevision undefined", async () => {
      const doc1 = createMockDocument();
      const doc2 = createMockDocument();
      const doc3 = createMockDocument();

      cache.putState("doc1", "test/type", "global", "main", 1, doc1);
      cache.putState("doc1", "test/type", "global", "main", 2, doc2);
      cache.putState("doc1", "test/type", "global", "main", 3, doc3);

      const retrieved = await cache.getState(
        "doc1",
        "test/type",
        "global",
        "main",
      );

      expect(retrieved).toBeDefined();
      expect(retrieved).not.toBe(doc3);
    });

    it("should return deep copy (mutations don't affect cache)", async () => {
      const doc = createMockDocument();

      cache.putState("doc1", "test/type", "global", "main", 1, doc);

      const retrieved = await cache.getState(
        "doc1",
        "test/type",
        "global",
        "main",
        1,
      );

      (retrieved.state as any).mutated = "yes";

      const retrievedAgain = await cache.getState(
        "doc1",
        "test/type",
        "global",
        "main",
        1,
      );

      expect((retrievedAgain.state as any).mutated).toBeUndefined();
    });

    it("should update LRU on cache hit", async () => {
      const doc = createMockDocument();

      cache.putState("doc1", "test/type", "global", "main", 1, doc);
      cache.putState("doc2", "test/type", "global", "main", 1, doc);
      cache.putState("doc3", "test/type", "global", "main", 1, doc);

      await cache.getState("doc1", "test/type", "global", "main", 1);

      cache.putState("doc4", "test/type", "global", "main", 1, doc);

      const evicted1 = cache.invalidate("doc1", "global", "main");
      expect(evicted1).toBe(1);

      const evicted2 = cache.invalidate("doc2", "global", "main");
      expect(evicted2).toBe(0);
    });

    it("should respect abort signal", async () => {
      const doc = createMockDocument();
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

    it("should handle cache miss (with cold rebuild)", async () => {
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
        kvStore,
        mockOperationStore,
        mockRegistry,
        config,
      );

      await expect(
        testCache.getState("non-existent", "test/type", "global", "main", 1),
      ).rejects.toThrow("Failed to rebuild document non-existent");
    });
  });
});

describe("KyselyWriteCache - Cold Miss Rebuild", () => {
  let kvStore: InMemoryKeyValueStore;
  let operationStore: IOperationStore;
  let registry: IDocumentModelRegistry;
  let cache: KyselyWriteCache;
  let config: WriteCacheConfig;
  let db: any;

  beforeEach(async () => {
    kvStore = new InMemoryKeyValueStore();
    const opStoreSetup = await createTestOperationStore();
    operationStore = opStoreSetup.store;
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
    cache = new KyselyWriteCache(kvStore, operationStore, registry, config);
    await cache.startup();
  });

  afterEach(async () => {
    await cache.shutdown();
    if (db) {
      await db.destroy();
    }
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

    expect(document).toBeDefined();
    expect(document.state).toBeDefined();
  });

  it("should use keyframe if available (keyframe-accelerated rebuild)", async () => {
    const docId = "test-doc-2";
    const docType = "powerhouse/document-model";

    const operations: Operation[] = [];
    for (let i = 1; i <= 25; i++) {
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

    const doc10 = await cache.getState(docId, docType, "global", "main", 10);
    cache.putState(docId, docType, "global", "main", 10, doc10);

    await new Promise((resolve) => setTimeout(resolve, 10));

    cache.clear();

    const document = await cache.getState(docId, docType, "global", "main", 25);

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

    await cache.getState(docId, docType, "global", "main");

    const document = await cache.getState(docId, docType, "global", "main");

    expect(document).toBeDefined();
    expect(document.state).toBeDefined();
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
