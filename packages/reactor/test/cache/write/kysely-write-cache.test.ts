import type { Operation, PHDocument } from "document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KyselyWriteCache } from "../../../src/cache/kysely-write-cache.js";
import type { WriteCacheConfig } from "../../../src/cache/write-cache-types.js";
import type { IDocumentModelRegistry } from "../../../src/registry/interfaces.js";
import type {
  IKeyframeStore,
  IOperationStore,
} from "../../../src/storage/interfaces.js";
import {
  createCreateDocumentOperation,
  createTestOperation,
  createTestOperationStore,
} from "../../factories.js";

function createMockOperationStore(): IOperationStore {
  return {
    apply: vi.fn(),
    getSince: vi.fn().mockResolvedValue({
      results: [],
      options: { cursor: "0", limit: 100 },
      nextCursor: undefined,
    }),
    getSinceId: vi.fn().mockResolvedValue({
      results: [],
      options: { cursor: "0", limit: 100 },
      nextCursor: undefined,
    }),
    getConflicting: vi.fn().mockResolvedValue({
      results: [],
      options: { cursor: "0", limit: 100 },
      nextCursor: undefined,
    }),
    getRevisions: vi.fn().mockResolvedValue({
      revision: {},
      latestTimestamp: new Date().toISOString(),
    }),
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
    getSupportedVersions: vi.fn(),
    getLatestVersion: vi.fn(),
    registerUpgradeManifests: vi.fn(),
    getUpgradeManifest: vi.fn(),
    computeUpgradePath: vi.fn(),
    getUpgradeReducer: vi.fn(),
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
      hotThresholdMs: 5000,
      hotKeyframeInterval: Number.MAX_SAFE_INTEGER,
      coldKeyframeInterval: Number.MAX_SAFE_INTEGER,
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

      cache.putState("doc1", "global", "main", 1, doc1);

      const retrieved = await cache.getState("doc1", "global", "main", 1);

      expect(retrieved).toEqual(doc1);
    });

    it("should deep copy documents on put", () => {
      const doc = createTestDocument();
      const originalDoc = structuredClone(doc);

      cache.putState("doc1", "global", "main", 1, doc);

      doc.state.document.version = 100;

      expect(doc.state.document.version).toBe(100);
      expect(originalDoc.state.document.version).not.toBe(100);
    });

    it("should evict LRU stream when at capacity", () => {
      const doc = createTestDocument();

      cache.putState("doc1", "global", "main", 1, doc);
      cache.putState("doc2", "global", "main", 1, doc);
      cache.putState("doc3", "global", "main", 1, doc);

      // the LRU is set to capacity of 3, so doc1 should be evicted
      cache.putState("doc4", "global", "main", 1, doc);

      // evicting the doc that has already been evicted should not evict anything
      const evicted = cache.invalidate("doc1", "global", "main");
      expect(evicted).toBe(0);
    });

    it("should maintain ring buffer per stream", () => {
      cache.putState("doc1", "global", "main", 1, createTestDocument());
      cache.putState("doc1", "global", "main", 2, createTestDocument());
      cache.putState("doc1", "global", "main", 3, createTestDocument());
      cache.putState("doc1", "global", "main", 4, createTestDocument());
      cache.putState("doc1", "global", "main", 5, createTestDocument());
      cache.putState("doc1", "global", "main", 6, createTestDocument());

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

      cache.putState("doc1", "global", "main", 1, doc);
      cache.putState("doc1", "global", "feature", 1, doc);
      cache.putState("doc1", "local", "main", 1, doc);

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
        hotThresholdMs: 5000,
        hotKeyframeInterval: Number.MAX_SAFE_INTEGER,
        coldKeyframeInterval: Number.MAX_SAFE_INTEGER,
      };
      cacheWithHigherCapacity = new KyselyWriteCache(
        keyframeStore,
        operationStore,
        registry,
        highCapacityConfig,
      );

      const doc = createTestDocument();
      cacheWithHigherCapacity.putState("doc1", "global", "main", 1, doc);
      cacheWithHigherCapacity.putState("doc1", "global", "feature", 1, doc);
      cacheWithHigherCapacity.putState("doc1", "local", "main", 1, doc);
      cacheWithHigherCapacity.putState("doc2", "global", "main", 1, doc);
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
      cache.putState("doc1", "global", "main", 1, doc);
      cache.putState("doc2", "global", "main", 1, doc);

      cache.clear();

      const evicted = cache.invalidate("doc1", "global", "main");
      expect(evicted).toBe(0);
    });
  });

  describe("keyframe persistence", () => {
    it("should not persist keyframes during putState", () => {
      const doc = createTestDocument();

      cache.putState("doc1", "global", "main", 10, doc);
      cache.putState("doc1", "global", "main", 20, doc);

      expect(keyframeStore.putKeyframe).not.toHaveBeenCalled();
    });

    it("should persist keyframe on eviction with newest snapshot", () => {
      const doc = createTestDocument();

      cache.putState("doc1", "global", "main", 1, doc);
      cache.putState("doc1", "global", "main", 5, doc);
      cache.putState("doc2", "global", "main", 1, doc);
      cache.putState("doc3", "global", "main", 1, doc);

      // maxDocuments=3, so adding doc4 evicts doc1 (LRU)
      cache.putState("doc4", "global", "main", 1, doc);

      expect(keyframeStore.putKeyframe).toHaveBeenCalledTimes(1);
      expect(keyframeStore.putKeyframe).toHaveBeenCalledWith(
        "doc1",
        "global",
        "main",
        5,
        expect.objectContaining({
          state: expect.any(Object),
          header: expect.any(Object),
        }),
      );
    });

    it("should persist keyframes for all active streams on shutdown", async () => {
      const doc = createTestDocument();

      cache.putState("doc1", "global", "main", 3, doc);
      cache.putState("doc2", "global", "main", 7, doc);

      await cache.shutdown();

      expect(keyframeStore.putKeyframe).toHaveBeenCalledTimes(2);
      expect(keyframeStore.putKeyframe).toHaveBeenCalledWith(
        "doc1",
        "global",
        "main",
        3,
        expect.objectContaining({
          state: expect.any(Object),
          header: expect.any(Object),
        }),
      );
      expect(keyframeStore.putKeyframe).toHaveBeenCalledWith(
        "doc2",
        "global",
        "main",
        7,
        expect.objectContaining({
          state: expect.any(Object),
          header: expect.any(Object),
        }),
      );
    });

    it("should handle keyframe persistence errors on eviction gracefully", () => {
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

      const doc = createTestDocument();

      failingCache.putState("doc1", "global", "main", 1, doc);
      failingCache.putState("doc2", "global", "main", 1, doc);
      failingCache.putState("doc3", "global", "main", 1, doc);

      // eviction triggers keyframe persist which will fail
      expect(() => {
        failingCache.putState("doc4", "global", "main", 1, doc);
      }).not.toThrow();
    });

    it("should handle keyframe persistence errors on shutdown gracefully", async () => {
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

      const doc = createTestDocument();
      failingCache.putState("doc1", "global", "main", 1, doc);

      await expect(failingCache.shutdown()).resolves.toBeUndefined();
    });
  });

  describe("adaptive keyframe persistence", () => {
    it("should persist keyframe when cold stream exceeds coldKeyframeInterval", () => {
      vi.useFakeTimers();

      const coldCache = new KyselyWriteCache(
        keyframeStore,
        operationStore,
        registry,
        {
          maxDocuments: 10,
          ringBufferSize: 5,
          hotThresholdMs: 100,
          hotKeyframeInterval: 1000,
          coldKeyframeInterval: 5,
        },
      );

      const doc = createTestDocument();

      // Revisions 1..4: cold writes (>100ms apart), under coldKeyframeInterval
      for (let i = 1; i <= 4; i++) {
        vi.setSystemTime(i * 1000);
        coldCache.putState("doc1", "global", "main", i, doc);
      }
      expect(keyframeStore.putKeyframe).not.toHaveBeenCalled();

      // Revision 5: meets coldKeyframeInterval (5 - 0 = 5 >= 5)
      vi.setSystemTime(5000);
      coldCache.putState("doc1", "global", "main", 5, doc);
      expect(keyframeStore.putKeyframe).toHaveBeenCalledTimes(1);
      expect(keyframeStore.putKeyframe).toHaveBeenCalledWith(
        "doc1",
        "global",
        "main",
        5,
        expect.objectContaining({
          state: expect.any(Object),
          header: expect.any(Object),
        }),
      );

      vi.useRealTimers();
    });

    it("should persist keyframe at hotKeyframeInterval during hot writes", () => {
      vi.useFakeTimers();
      vi.setSystemTime(1000);

      const hotCache = new KyselyWriteCache(
        keyframeStore,
        operationStore,
        registry,
        {
          maxDocuments: 10,
          ringBufferSize: 5,
          hotThresholdMs: 5000,
          hotKeyframeInterval: 10,
          coldKeyframeInterval: 5,
        },
      );

      const doc = createTestDocument();

      // First call sets lastPutTimestamp; subsequent calls within hotThresholdMs are "hot"
      hotCache.putState("doc1", "global", "main", 1, doc);

      // Rapid writes (1ms apart) — hot path
      for (let i = 2; i <= 9; i++) {
        vi.setSystemTime(1000 + i);
        hotCache.putState("doc1", "global", "main", i, doc);
      }
      // Under hotKeyframeInterval (10), no keyframe yet
      expect(keyframeStore.putKeyframe).not.toHaveBeenCalled();

      // Revision 10: 10 - 0 = 10 >= hotKeyframeInterval
      vi.setSystemTime(1010);
      hotCache.putState("doc1", "global", "main", 10, doc);
      expect(keyframeStore.putKeyframe).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    it("should persist keyframe on hot-to-cold transition", () => {
      vi.useFakeTimers();
      vi.setSystemTime(1000);

      const transitionCache = new KyselyWriteCache(
        keyframeStore,
        operationStore,
        registry,
        {
          maxDocuments: 10,
          ringBufferSize: 5,
          hotThresholdMs: 100,
          hotKeyframeInterval: Number.MAX_SAFE_INTEGER,
          coldKeyframeInterval: Number.MAX_SAFE_INTEGER,
        },
      );

      const doc = createTestDocument();

      // Two rapid writes — establishes hot state
      transitionCache.putState("doc1", "global", "main", 1, doc);
      vi.setSystemTime(1010);
      transitionCache.putState("doc1", "global", "main", 2, doc);

      expect(keyframeStore.putKeyframe).not.toHaveBeenCalled();

      // Jump forward past hotThresholdMs — hot-to-cold transition
      vi.setSystemTime(2000);
      transitionCache.putState("doc1", "global", "main", 3, doc);

      expect(keyframeStore.putKeyframe).toHaveBeenCalledTimes(1);
      expect(keyframeStore.putKeyframe).toHaveBeenCalledWith(
        "doc1",
        "global",
        "main",
        3,
        expect.objectContaining({
          state: expect.any(Object),
          header: expect.any(Object),
        }),
      );

      vi.useRealTimers();
    });

    it("should not persist keyframe when hot and under hotKeyframeInterval", () => {
      vi.useFakeTimers();
      vi.setSystemTime(1000);

      const hotCache = new KyselyWriteCache(
        keyframeStore,
        operationStore,
        registry,
        {
          maxDocuments: 10,
          ringBufferSize: 5,
          hotThresholdMs: 5000,
          hotKeyframeInterval: 1000,
          coldKeyframeInterval: 5,
        },
      );

      const doc = createTestDocument();

      // Rapid writes — hot path, well under hotKeyframeInterval
      for (let i = 1; i <= 20; i++) {
        vi.setSystemTime(1000 + i);
        hotCache.putState("doc1", "global", "main", i, doc);
      }

      expect(keyframeStore.putKeyframe).not.toHaveBeenCalled();

      vi.useRealTimers();
    });

    it("should reset keyframe counter after persisting", () => {
      vi.useFakeTimers();

      const coldCache = new KyselyWriteCache(
        keyframeStore,
        operationStore,
        registry,
        {
          maxDocuments: 10,
          ringBufferSize: 5,
          hotThresholdMs: 100,
          hotKeyframeInterval: 1000,
          coldKeyframeInterval: 5,
        },
      );

      const doc = createTestDocument();

      // First keyframe at revision 5 (cold writes, >100ms apart)
      for (let i = 1; i <= 5; i++) {
        vi.setSystemTime(i * 1000);
        coldCache.putState("doc1", "global", "main", i, doc);
      }
      expect(keyframeStore.putKeyframe).toHaveBeenCalledTimes(1);

      // Next keyframe at revision 10 (5 more since last keyframe at 5)
      for (let i = 6; i <= 10; i++) {
        vi.setSystemTime((i + 5) * 1000);
        coldCache.putState("doc1", "global", "main", i, doc);
      }
      expect(keyframeStore.putKeyframe).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it("should track hot/cold state independently per stream", () => {
      vi.useFakeTimers();

      const adaptiveCache = new KyselyWriteCache(
        keyframeStore,
        operationStore,
        registry,
        {
          maxDocuments: 10,
          ringBufferSize: 5,
          hotThresholdMs: 100,
          hotKeyframeInterval: 999999,
          coldKeyframeInterval: 3,
        },
      );

      const doc = createTestDocument();

      // doc1: cold writes (>100ms apart), should keyframe at revision 3
      // doc2: hot writes (<100ms apart), should NOT keyframe at revision 3
      vi.setSystemTime(1000);
      adaptiveCache.putState("doc1", "global", "main", 1, doc);

      vi.setSystemTime(2000);
      adaptiveCache.putState("doc1", "global", "main", 2, doc);

      vi.setSystemTime(3000);
      adaptiveCache.putState("doc1", "global", "main", 3, doc);

      // doc1 (cold) should have triggered a keyframe
      expect(keyframeStore.putKeyframe).toHaveBeenCalledTimes(1);
      expect(keyframeStore.putKeyframe).toHaveBeenCalledWith(
        "doc1",
        "global",
        "main",
        3,
        expect.objectContaining({
          state: expect.any(Object),
          header: expect.any(Object),
        }),
      );

      // doc2: three rapid writes — all within 100ms of each other
      vi.setSystemTime(4000);
      adaptiveCache.putState("doc2", "global", "main", 1, doc);
      vi.setSystemTime(4010);
      adaptiveCache.putState("doc2", "global", "main", 2, doc);
      vi.setSystemTime(4020);
      adaptiveCache.putState("doc2", "global", "main", 3, doc);

      // doc2 (hot) should NOT have triggered any additional keyframes
      expect(keyframeStore.putKeyframe).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    it("should trigger multiple keyframes across sustained hot writes", () => {
      vi.useFakeTimers();
      vi.setSystemTime(1000);

      const hotCache = new KyselyWriteCache(
        keyframeStore,
        operationStore,
        registry,
        {
          maxDocuments: 10,
          ringBufferSize: 5,
          hotThresholdMs: 5000,
          hotKeyframeInterval: 10,
          coldKeyframeInterval: 999999,
        },
      );

      const doc = createTestDocument();

      // 30 rapid writes — should keyframe at revisions 10, 20, 30
      for (let i = 1; i <= 30; i++) {
        vi.setSystemTime(1000 + i);
        hotCache.putState("doc1", "global", "main", i, doc);
      }

      expect(keyframeStore.putKeyframe).toHaveBeenCalledTimes(3);
      expect(keyframeStore.putKeyframe).toHaveBeenNthCalledWith(
        1,
        "doc1",
        "global",
        "main",
        10,
        expect.objectContaining({ state: expect.any(Object) }),
      );
      expect(keyframeStore.putKeyframe).toHaveBeenNthCalledWith(
        2,
        "doc1",
        "global",
        "main",
        20,
        expect.objectContaining({ state: expect.any(Object) }),
      );
      expect(keyframeStore.putKeyframe).toHaveBeenNthCalledWith(
        3,
        "doc1",
        "global",
        "main",
        30,
        expect.objectContaining({ state: expect.any(Object) }),
      );

      vi.useRealTimers();
    });

    it("should handle repeated hot/cold oscillation", () => {
      vi.useFakeTimers();

      const oscillatingCache = new KyselyWriteCache(
        keyframeStore,
        operationStore,
        registry,
        {
          maxDocuments: 10,
          ringBufferSize: 10,
          hotThresholdMs: 100,
          hotKeyframeInterval: 999999,
          coldKeyframeInterval: 999999,
        },
      );

      const doc = createTestDocument();

      // First hot burst (revisions 1-3)
      vi.setSystemTime(1000);
      oscillatingCache.putState("doc1", "global", "main", 1, doc);
      vi.setSystemTime(1010);
      oscillatingCache.putState("doc1", "global", "main", 2, doc);
      vi.setSystemTime(1020);
      oscillatingCache.putState("doc1", "global", "main", 3, doc);
      expect(keyframeStore.putKeyframe).toHaveBeenCalledTimes(0);

      // First hot-to-cold transition (revision 4)
      vi.setSystemTime(5000);
      oscillatingCache.putState("doc1", "global", "main", 4, doc);
      expect(keyframeStore.putKeyframe).toHaveBeenCalledTimes(1);

      // Second hot burst (revisions 5-6)
      vi.setSystemTime(5010);
      oscillatingCache.putState("doc1", "global", "main", 5, doc);
      vi.setSystemTime(5020);
      oscillatingCache.putState("doc1", "global", "main", 6, doc);
      expect(keyframeStore.putKeyframe).toHaveBeenCalledTimes(1);

      // Second hot-to-cold transition (revision 7)
      vi.setSystemTime(10000);
      oscillatingCache.putState("doc1", "global", "main", 7, doc);
      expect(keyframeStore.putKeyframe).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it("should handle non-sequential revisions based on revision delta", () => {
      vi.useFakeTimers();

      const coldCache = new KyselyWriteCache(
        keyframeStore,
        operationStore,
        registry,
        {
          maxDocuments: 10,
          ringBufferSize: 5,
          hotThresholdMs: 100,
          hotKeyframeInterval: 999999,
          coldKeyframeInterval: 50,
        },
      );

      const doc = createTestDocument();

      // Revision 1: delta is 1 - 0 = 1, no keyframe
      vi.setSystemTime(1000);
      coldCache.putState("doc1", "global", "main", 1, doc);
      expect(keyframeStore.putKeyframe).not.toHaveBeenCalled();

      // Revision 40: delta is 40 - 0 = 40, still under 50
      vi.setSystemTime(2000);
      coldCache.putState("doc1", "global", "main", 40, doc);
      expect(keyframeStore.putKeyframe).not.toHaveBeenCalled();

      // Revision 50: delta is 50 - 0 = 50, meets coldKeyframeInterval
      vi.setSystemTime(3000);
      coldCache.putState("doc1", "global", "main", 50, doc);
      expect(keyframeStore.putKeyframe).toHaveBeenCalledTimes(1);

      // Revision 200: delta is 200 - 50 = 150, meets interval again
      vi.setSystemTime(4000);
      coldCache.putState("doc1", "global", "main", 200, doc);
      expect(keyframeStore.putKeyframe).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it("should reset tracking fields when stream is re-created after eviction", () => {
      vi.useFakeTimers();

      const evictionCache = new KyselyWriteCache(
        keyframeStore,
        operationStore,
        registry,
        {
          maxDocuments: 3,
          ringBufferSize: 5,
          hotThresholdMs: 100,
          hotKeyframeInterval: 999999,
          coldKeyframeInterval: 999999,
        },
      );

      const doc = createTestDocument();

      // Build up hot state on doc1
      vi.setSystemTime(1000);
      evictionCache.putState("doc1", "global", "main", 1, doc);
      vi.setSystemTime(1010);
      evictionCache.putState("doc1", "global", "main", 2, doc);

      // Fill cache to capacity (3), then add doc4 to evict doc1 (LRU)
      vi.setSystemTime(2000);
      evictionCache.putState("doc2", "global", "main", 1, doc);
      vi.setSystemTime(3000);
      evictionCache.putState("doc3", "global", "main", 1, doc);
      vi.setSystemTime(4000);
      evictionCache.putState("doc4", "global", "main", 1, doc);

      // doc1 was evicted (keyframe on eviction)
      expect(keyframeStore.putKeyframe).toHaveBeenCalledTimes(1);
      vi.mocked(keyframeStore.putKeyframe).mockClear();

      // Touch doc2 + doc3 so doc4 becomes LRU before re-adding doc1
      vi.setSystemTime(5000);
      evictionCache.putState("doc2", "global", "main", 2, doc);
      evictionCache.putState("doc3", "global", "main", 2, doc);

      // Re-create doc1 stream (evicts doc4) — should have fresh tracking fields
      // Two rapid writes establish hot state from scratch
      vi.setSystemTime(6000);
      evictionCache.putState("doc1", "global", "main", 3, doc);
      vi.setSystemTime(6010);
      evictionCache.putState("doc1", "global", "main", 4, doc);

      // Eviction of doc4 is 1 call; clear it to isolate the transition test
      vi.mocked(keyframeStore.putKeyframe).mockClear();

      // Transition to cold — should fire because wasHot was set from the new hot burst
      vi.setSystemTime(10000);
      evictionCache.putState("doc1", "global", "main", 5, doc);
      expect(keyframeStore.putKeyframe).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    it("should not persist keyframe on cold-to-hot transition", () => {
      vi.useFakeTimers();

      const transitionCache = new KyselyWriteCache(
        keyframeStore,
        operationStore,
        registry,
        {
          maxDocuments: 10,
          ringBufferSize: 5,
          hotThresholdMs: 100,
          hotKeyframeInterval: 999999,
          coldKeyframeInterval: 999999,
        },
      );

      const doc = createTestDocument();

      // Cold writes
      vi.setSystemTime(1000);
      transitionCache.putState("doc1", "global", "main", 1, doc);
      vi.setSystemTime(2000);
      transitionCache.putState("doc1", "global", "main", 2, doc);

      // Switch to rapid writes (cold-to-hot)
      vi.setSystemTime(2010);
      transitionCache.putState("doc1", "global", "main", 3, doc);
      vi.setSystemTime(2020);
      transitionCache.putState("doc1", "global", "main", 4, doc);
      vi.setSystemTime(2030);
      transitionCache.putState("doc1", "global", "main", 5, doc);

      // No keyframe should have fired — cold-to-hot does not trigger
      expect(keyframeStore.putKeyframe).not.toHaveBeenCalled();

      vi.useRealTimers();
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

      cache.putState("doc1", "global", "main", 1, doc);
      cache.putState("doc2", "global", "main", 1, doc);
      cache.putState("doc3", "global", "main", 1, doc);

      // make doc1 the most recently used
      cache.putState("doc1", "global", "main", 2, doc);

      // doc2 should be evicted now
      cache.putState("doc4", "global", "main", 1, doc);

      const evicted = cache.invalidate("doc2", "global", "main");
      expect(evicted).toBe(0);
    });

    it("should update LRU on putState", () => {
      const doc = createTestDocument();

      cache.putState("doc1", "global", "main", 1, doc);
      cache.putState("doc2", "global", "main", 1, doc);
      cache.putState("doc3", "global", "main", 1, doc);

      // make doc1 the most recently used
      cache.putState("doc1", "global", "main", 2, doc);
      cache.putState("doc1", "global", "main", 3, doc);

      // make doc4 the most recently used, which will evict doc2
      cache.putState("doc4", "global", "main", 1, doc);

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

      cache.putState("doc1", "global", "main", 1, doc1);
      cache.putState("doc1", "global", "main", 2, doc2);
      cache.putState("doc1", "global", "main", 3, doc3);

      const retrieved = await cache.getState("doc1", "global", "main", 2);

      expect(retrieved).toEqual(doc2);
    });

    it("should return newest snapshot when targetRevision undefined", async () => {
      const doc1 = createTestDocument();
      const doc2 = createTestDocument();
      const doc3 = createTestDocument();

      cache.putState("doc1", "global", "main", 1, doc1);
      cache.putState("doc1", "global", "main", 2, doc2);
      cache.putState("doc1", "global", "main", 3, doc3);

      const retrieved = await cache.getState("doc1", "global", "main");

      expect(retrieved).toEqual(doc3);
    });

    it("should update LRU on cache hit", async () => {
      const doc = createTestDocument();

      cache.putState("doc1", "global", "main", 1, doc);
      cache.putState("doc2", "global", "main", 1, doc);
      cache.putState("doc3", "global", "main", 1, doc);

      await cache.getState("doc1", "global", "main", 1);

      // this will evict doc2
      cache.putState("doc4", "global", "main", 1, doc);

      const evicted1 = cache.invalidate("doc1", "global", "main");
      expect(evicted1).toBe(1);

      // already evicted
      const evicted2 = cache.invalidate("doc2", "global", "main");
      expect(evicted2).toBe(0);
    });

    it("should respect abort signal", async () => {
      const doc = createTestDocument();
      cache.putState("doc1", "global", "main", 1, doc);

      const controller = new AbortController();
      controller.abort();

      await expect(
        cache.getState("doc1", "global", "main", 1, controller.signal),
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
      getSupportedVersions: vi.fn(),
      getLatestVersion: vi.fn(),
      registerUpgradeManifests: vi.fn(),
      getUpgradeManifest: vi.fn(),
      computeUpgradePath: vi.fn(),
      getUpgradeReducer: vi.fn(),
    };

    registry = mockRegistry;

    config = {
      maxDocuments: 10,
      ringBufferSize: 5,
      hotThresholdMs: 5000,
      hotKeyframeInterval: Number.MAX_SAFE_INTEGER,
      coldKeyframeInterval: Number.MAX_SAFE_INTEGER,
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
      results: [],
      options: { cursor: "0", limit: 100 },
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
      testCache.getState("non-existent", "global", "main", 1),
    ).rejects.toThrow("Failed to rebuild document non-existent");
  });

  it("should rebuild document from scratch on cold miss (no keyframe)", async () => {
    const docId = "test-doc-1";
    const docType = "powerhouse/document-model";

    await operationStore.apply(docId, docType, "document", "main", 0, (txn) => {
      txn.addOperations(createCreateDocumentOperation(docId, docType));
    });

    const operations: Operation[] = [];
    for (let i = 1; i <= 5; i++) {
      operations.push(
        createTestOperation(docId, {
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

    cache.clear();

    const rebuilt = await cache.getState(docId, "global", "main");

    expect(rebuilt.state).toBeDefined();
    expect(rebuilt.header).toBeDefined();
    expect(rebuilt.header.documentType).toBe(docType);
  });

  it("should use keyframe if available (keyframe-accelerated rebuild)", async () => {
    const docId = "test-doc-2";
    const docType = "powerhouse/document-model";

    await operationStore.apply(docId, docType, "document", "main", 0, (txn) => {
      txn.addOperations(createCreateDocumentOperation(docId, docType));
    });

    const operations: Operation[] = [];
    for (let i = 1; i <= 22; i++) {
      operations.push(
        createTestOperation(docId, {
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

    const doc20 = await cache.getState(docId, "global", "main", 20);
    await keyframeStore.putKeyframe(docId, "global", "main", 20, doc20);

    // now delete operations 1 - 20, this will prove that the keyframe is used
    await db
      .deleteFrom("Operation")
      .where("documentId", "=", docId)
      .where("index", "<", 21)
      .execute();

    cache.clear();

    const document = await cache.getState(docId, "global", "main", 22);

    expect(document).toBeDefined();
    expect(document.state).toBeDefined();
  });

  it("should cache result after rebuild", async () => {
    const docId = "test-doc-3";
    const docType = "powerhouse/document-model";

    await operationStore.apply(docId, docType, "document", "main", 0, (txn) => {
      txn.addOperations(createCreateDocumentOperation(docId, docType));
    });

    const operations: Operation[] = [];
    for (let i = 1; i <= 3; i++) {
      operations.push(
        createTestOperation(docId, {
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

    await cache.getState(docId, "global", "main");

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

    await operationStore.apply(docId, docType, "document", "main", 0, (txn) => {
      txn.addOperations(createCreateDocumentOperation(docId, docType));
    });

    const operations: Operation[] = [];
    for (let i = 1; i <= 5; i++) {
      operations.push(
        createTestOperation(docId, {
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
      cache.getState(docId, "global", "main", undefined, controller.signal),
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
      getSupportedVersions: vi.fn(),
      getLatestVersion: vi.fn(),
      registerUpgradeManifests: vi.fn(),
      getUpgradeManifest: vi.fn(),
      computeUpgradePath: vi.fn(),
      getUpgradeReducer: vi.fn(),
    };

    registry = mockRegistry;

    config = {
      maxDocuments: 10,
      ringBufferSize: 5,
      hotThresholdMs: 5000,
      hotKeyframeInterval: Number.MAX_SAFE_INTEGER,
      coldKeyframeInterval: Number.MAX_SAFE_INTEGER,
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
      try {
        await db.destroy();
      } catch {
        //
      }
    }
  });

  it("should use cached base revision for warm miss", async () => {
    const docId = "test-warm-1";
    const docType = "powerhouse/document-model";

    await operationStore.apply(docId, docType, "document", "main", 0, (txn) => {
      txn.addOperations(createCreateDocumentOperation(docId, docType));
    });

    const operations: Operation[] = [];
    for (let i = 1; i <= 15; i++) {
      operations.push(
        createTestOperation(docId, {
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

    const doc10 = await cache.getState(docId, "global", "main", 10);
    expect(doc10).toBeDefined();

    // delete operations 1 - 10, this will prove that the cached base revision is used
    await db
      .deleteFrom("Operation")
      .where("documentId", "=", docId)
      .where("index", "<=", 10)
      .execute();

    const doc15 = await cache.getState(docId, "global", "main", 15);
    expect(doc15).toBeDefined();
  });

  it("should only load operations after base revision", async () => {
    const docId = "test-warm-2";
    const docType = "powerhouse/document-model";

    await operationStore.apply(docId, docType, "document", "main", 0, (txn) => {
      txn.addOperations(createCreateDocumentOperation(docId, docType));
    });

    const operations: Operation[] = [];
    for (let i = 1; i <= 20; i++) {
      operations.push(
        createTestOperation(docId, {
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

    await cache.getState(docId, "global", "main", 10);

    await db
      .deleteFrom("Operation")
      .where("documentId", "=", docId)
      .where("index", "<=", 10)
      .execute();

    const doc20 = await cache.getState(docId, "global", "main", 20);
    expect(doc20).toBeDefined();
  });

  it("should build to exact targetRevision", async () => {
    const docId = "test-warm-3";
    const docType = "powerhouse/document-model";

    await operationStore.apply(docId, docType, "document", "main", 0, (txn) => {
      txn.addOperations(createCreateDocumentOperation(docId, docType));
    });

    const operations: Operation[] = [];
    for (let i = 1; i <= 25; i++) {
      operations.push(
        createTestOperation(docId, {
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

    await cache.getState(docId, "global", "main", 10);

    const doc17 = await cache.getState(docId, "global", "main", 17);
    expect(doc17).toBeDefined();
  });

  it("should cache result after warm rebuild", async () => {
    const docId = "test-warm-4";
    const docType = "powerhouse/document-model";

    await operationStore.apply(docId, docType, "document", "main", 0, (txn) => {
      txn.addOperations(createCreateDocumentOperation(docId, docType));
    });

    const operations: Operation[] = [];
    for (let i = 1; i <= 15; i++) {
      operations.push(
        createTestOperation(docId, {
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

    await cache.getState(docId, "global", "main", 10);

    const streamBefore = cache.getStream(docId, "global", "main");
    expect(streamBefore?.ringBuffer.length).toBe(1);

    await cache.getState(docId, "global", "main", 15);

    const streamAfter = cache.getStream(docId, "global", "main");
    expect(streamAfter?.ringBuffer.length).toBe(2);

    const snapshots = streamAfter?.ringBuffer.getAll();
    expect(snapshots?.[0].revision).toBe(10);
    expect(snapshots?.[1].revision).toBe(15);
  });

  it("should handle multiple revisions in ring buffer", async () => {
    const docId = "test-warm-5";
    const docType = "powerhouse/document-model";

    await operationStore.apply(docId, docType, "document", "main", 0, (txn) => {
      txn.addOperations(createCreateDocumentOperation(docId, docType));
    });

    const operations: Operation[] = [];
    for (let i = 1; i <= 35; i++) {
      operations.push(
        createTestOperation(docId, {
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

    await cache.getState(docId, "global", "main", 10);
    await cache.getState(docId, "global", "main", 20);
    await cache.getState(docId, "global", "main", 30);

    await db
      .deleteFrom("Operation")
      .where("documentId", "=", docId)
      .where("index", "<=", 30)
      .execute();

    const doc35 = await cache.getState(docId, "global", "main", 35);
    expect(doc35).toBeDefined();
  });

  it("should choose nearest older revision as base", async () => {
    const docId = "test-warm-6";
    const docType = "powerhouse/document-model";

    await operationStore.apply(docId, docType, "document", "main", 0, (txn) => {
      txn.addOperations(createCreateDocumentOperation(docId, docType));
    });

    const operations: Operation[] = [];
    for (let i = 1; i <= 65; i++) {
      operations.push(
        createTestOperation(docId, {
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

    await cache.getState(docId, "global", "main", 10);
    await cache.getState(docId, "global", "main", 30);
    await cache.getState(docId, "global", "main", 50);

    await db
      .deleteFrom("Operation")
      .where("documentId", "=", docId)
      .where("index", "<=", 50)
      .execute();

    await keyframeStore.deleteKeyframes(docId, "global", "main");

    const doc65 = await cache.getState(docId, "global", "main", 65);
    expect(doc65).toBeDefined();
  });

  it("should handle warm miss with abort signal", async () => {
    const docId = "test-warm-7";
    const docType = "powerhouse/document-model";

    await operationStore.apply(docId, docType, "document", "main", 0, (txn) => {
      txn.addOperations(createCreateDocumentOperation(docId, docType));
    });

    const operations: Operation[] = [];
    for (let i = 1; i <= 20; i++) {
      operations.push(
        createTestOperation(docId, {
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

    await cache.getState(docId, "global", "main", 10);

    const controller = new AbortController();
    controller.abort();

    await expect(
      cache.getState(docId, "global", "main", 15, controller.signal),
    ).rejects.toThrow("Operation aborted");
  });
});
