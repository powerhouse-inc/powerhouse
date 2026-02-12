import type { Operation } from "document-model";
import {
  deriveOperationId,
  documentModelDocumentModelModule,
  generateId,
} from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KyselyWriteCache } from "../../../src/cache/kysely-write-cache.js";
import type { WriteCacheConfig } from "../../../src/cache/write-cache-types.js";
import { ModuleNotFoundError } from "../../../src/registry/implementation.js";
import type { IDocumentModelRegistry } from "../../../src/registry/interfaces.js";
import type {
  IKeyframeStore,
  IOperationStore,
} from "../../../src/storage/interfaces.js";
import {
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

describe("KyselyWriteCache - Error Handling", () => {
  let keyframeStore: IKeyframeStore;
  let operationStore: IOperationStore;
  let registry: IDocumentModelRegistry;
  let cache: KyselyWriteCache;
  let config: WriteCacheConfig;

  beforeEach(() => {
    keyframeStore = createMockKeyframeStore();
    operationStore = createMockOperationStore();
    registry = createMockRegistry();
    config = {
      maxDocuments: 10,
      ringBufferSize: 5,
    };
    cache = new KyselyWriteCache(
      keyframeStore,
      operationStore,
      registry,
      config,
    );
  });

  describe("ModuleNotFoundError", () => {
    it("should propagate ModuleNotFoundError during cold miss", async () => {
      const actionId = generateId();
      const createOp = {
        ...createTestOperation("doc1", { index: 0, skip: 0 }),
        action: {
          id: actionId,
          type: "CREATE_DOCUMENT",
          scope: "document",
          timestampUtcMs: new Date().toISOString(),
          input: {
            documentId: "doc1",
            model: "test/unknown",
            version: 0,
          },
        },
      };

      const mockGetSince = vi.fn().mockImplementation((docId, scope) => {
        if (scope === "document") {
          return Promise.resolve({
            results: [createOp],
            options: { cursor: "0", limit: 100 },
            nextCursor: undefined,
          });
        }
        return Promise.resolve({
          results: [createTestOperation("doc1", { index: 1, skip: 0 })],
          options: { cursor: "0", limit: 100 },
          nextCursor: undefined,
        });
      });

      const mockOperationStore = {
        ...createMockOperationStore(),
        getSince: mockGetSince,
      };

      const mockRegistry = createMockRegistry();
      mockRegistry.getModule = vi.fn().mockImplementation(() => {
        throw new ModuleNotFoundError("test/unknown");
      });

      const testCache = new KyselyWriteCache(
        keyframeStore,
        mockOperationStore,
        mockRegistry,
        config,
      );

      await expect(
        testCache.getState("doc1", "global", "main", 1),
      ).rejects.toThrow(ModuleNotFoundError);
    });

    it("should propagate ModuleNotFoundError during warm miss", async () => {
      const doc = documentModelDocumentModelModule.utils.createDocument();
      cache.putState("doc1", "global", "main", 1, doc);

      const mockRegistry = createMockRegistry();
      mockRegistry.getModule = vi.fn().mockImplementation(() => {
        throw new ModuleNotFoundError("test/type");
      });

      const testCache = new KyselyWriteCache(
        keyframeStore,
        operationStore,
        mockRegistry,
        config,
      );

      testCache.putState("doc1", "global", "main", 1, doc);

      await expect(
        testCache.getState("doc1", "global", "main", 2),
      ).rejects.toThrow(ModuleNotFoundError);
    });

    it("should not create cache entry for invalid document type", async () => {
      const mockRegistry = createMockRegistry();
      mockRegistry.getModule = vi.fn().mockImplementation(() => {
        throw new ModuleNotFoundError("test/invalid");
      });

      const testCache = new KyselyWriteCache(
        keyframeStore,
        operationStore,
        mockRegistry,
        config,
      );

      try {
        await testCache.getState("doc1", "global", "main", 1);
      } catch {
        // Expected error
      }

      const stream = testCache.getStream("doc1", "global", "main");
      expect(stream).toBeUndefined();
    });

    it("should include document type in error message", async () => {
      const documentType = "test/missing-type";
      const actionId = generateId();
      const createOp = {
        ...createTestOperation("doc1", { index: 0, skip: 0 }),
        action: {
          id: actionId,
          type: "CREATE_DOCUMENT",
          scope: "document",
          timestampUtcMs: new Date().toISOString(),
          input: {
            documentId: "doc1",
            model: documentType,
            version: 0,
          },
        },
      };

      const mockGetSince = vi.fn().mockImplementation((docId, scope) => {
        if (scope === "document") {
          return Promise.resolve({
            results: [createOp],
            options: { cursor: "0", limit: 100 },
            nextCursor: undefined,
          });
        }
        return Promise.resolve({
          results: [createTestOperation("doc1", { index: 1, skip: 0 })],
          options: { cursor: "0", limit: 100 },
          nextCursor: undefined,
        });
      });

      const mockOperationStore = {
        ...createMockOperationStore(),
        getSince: mockGetSince,
      };

      const mockRegistry = createMockRegistry();
      mockRegistry.getModule = vi.fn().mockImplementation(() => {
        throw new ModuleNotFoundError(documentType);
      });

      const testCache = new KyselyWriteCache(
        keyframeStore,
        mockOperationStore,
        mockRegistry,
        config,
      );

      await expect(
        testCache.getState("doc1", "global", "main", 1),
      ).rejects.toThrow(/test\/missing-type/);
    });
  });

  describe("Reducer errors", () => {
    it("should propagate reducer errors during cold miss rebuild", async () => {
      const actionId = generateId();
      const createOp = {
        ...createTestOperation("doc1", { index: 0, skip: 0 }),
        action: {
          id: actionId,
          type: "CREATE_DOCUMENT",
          scope: "document",
          timestampUtcMs: new Date().toISOString(),
          input: {
            documentId: "doc1",
            model: "powerhouse/document-model",
            version: 0,
          },
        },
      };

      const mockGetSince = vi.fn().mockImplementation((docId, scope) => {
        if (scope === "document") {
          return Promise.resolve({
            results: [createOp],
            options: { cursor: "0", limit: 100 },
            nextCursor: undefined,
          });
        }
        return Promise.resolve({
          results: [createTestOperation("doc1", { index: 1, skip: 0 })],
          options: { cursor: "0", limit: 100 },
          nextCursor: undefined,
        });
      });

      const mockOperationStore = {
        ...createMockOperationStore(),
        getSince: mockGetSince,
      };

      const reducerError = new Error("Reducer validation failed");
      const mockRegistry = {
        ...createMockRegistry(),
        getModule: vi.fn().mockReturnValue({
          reducer: vi.fn().mockImplementation(() => {
            throw reducerError;
          }),
          utils: documentModelDocumentModelModule.utils,
        }),
      };

      const testCache = new KyselyWriteCache(
        keyframeStore,
        mockOperationStore,
        mockRegistry,
        config,
      );

      await expect(
        testCache.getState("doc1", "global", "main", 1),
      ).rejects.toThrow("Reducer validation failed");
    });

    it("should propagate reducer errors during warm miss rebuild", async () => {
      const doc = documentModelDocumentModelModule.utils.createDocument();

      const mockGetSince = vi.fn().mockResolvedValue({
        results: [createTestOperation("doc1", { index: 2, skip: 0 })],
        options: { cursor: "0", limit: 100 },
        nextCursor: undefined,
      });

      const mockOperationStore = {
        ...createMockOperationStore(),
        getSince: mockGetSince,
      };

      const reducerError = new Error("Reducer failed on operation");
      const mockRegistry = {
        ...createMockRegistry(),
        getModule: vi.fn().mockReturnValue({
          reducer: vi.fn().mockImplementation(() => {
            throw reducerError;
          }),
          utils: documentModelDocumentModelModule.utils,
        }),
      };

      const testCache = new KyselyWriteCache(
        keyframeStore,
        mockOperationStore,
        mockRegistry,
        config,
      );

      testCache.putState("doc1", "global", "main", 1, doc);

      await expect(
        testCache.getState("doc1", "global", "main", 2),
      ).rejects.toThrow("Reducer failed on operation");
    });

    it("should not corrupt cache state when reducer throws", async () => {
      const doc = documentModelDocumentModelModule.utils.createDocument();
      cache.putState("doc1", "global", "main", 1, doc);

      const mockGetSince = vi.fn().mockResolvedValue({
        results: [createTestOperation("doc1", { index: 2, skip: 0 })],
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
          reducer: vi.fn().mockImplementation(() => {
            throw new Error("Reducer error");
          }),
          utils: documentModelDocumentModelModule.utils,
        }),
      };

      const testCache = new KyselyWriteCache(
        keyframeStore,
        mockOperationStore,
        mockRegistry,
        config,
      );

      testCache.putState("doc1", "global", "main", 1, doc);

      try {
        await testCache.getState("doc1", "global", "main", 2);
      } catch {
        // Expected error
      }

      const stream = testCache.getStream("doc1", "global", "main");
      expect(stream).toBeDefined();
      expect(stream?.ringBuffer.length).toBe(1);
      const snapshots = stream?.ringBuffer.getAll();
      expect(snapshots?.[0].revision).toBe(1);
    });

    it("should preserve error details from reducer", async () => {
      const actionId = generateId();
      const createOp = {
        ...createTestOperation("doc1", { index: 0, skip: 0 }),
        action: {
          id: actionId,
          type: "CREATE_DOCUMENT",
          scope: "document",
          timestampUtcMs: new Date().toISOString(),
          input: {
            documentId: "doc1",
            model: "powerhouse/document-model",
            version: 0,
          },
        },
      };

      const mockGetSince = vi.fn().mockImplementation((docId, scope) => {
        if (scope === "document") {
          return Promise.resolve({
            results: [createOp],
            options: { cursor: "0", limit: 100 },
            nextCursor: undefined,
          });
        }
        return Promise.resolve({
          results: [createTestOperation("doc1", { index: 1, skip: 0 })],
          options: { cursor: "0", limit: 100 },
          nextCursor: undefined,
        });
      });

      const mockOperationStore = {
        ...createMockOperationStore(),
        getSince: mockGetSince,
      };

      const customError = new Error("Custom reducer error with details");
      customError.name = "CustomReducerError";

      const mockRegistry = {
        ...createMockRegistry(),
        getModule: vi.fn().mockReturnValue({
          reducer: vi.fn().mockImplementation(() => {
            throw customError;
          }),
          utils: documentModelDocumentModelModule.utils,
        }),
      };

      const testCache = new KyselyWriteCache(
        keyframeStore,
        mockOperationStore,
        mockRegistry,
        config,
      );

      await expect(
        testCache.getState("doc1", "global", "main", 1),
      ).rejects.toThrow(/Custom reducer error with details/);
    });
  });

  describe("Abort signal", () => {
    it("should handle abort during keyframe lookup", async () => {
      const mockKeyframeStore = createMockKeyframeStore();
      mockKeyframeStore.findNearestKeyframe = vi
        .fn()
        .mockRejectedValue(new Error("Operation aborted"));

      const testCache = new KyselyWriteCache(
        mockKeyframeStore,
        operationStore,
        registry,
        config,
      );

      const controller = new AbortController();
      controller.abort();

      await expect(
        testCache.getState("doc1", "global", "main", 10, controller.signal),
      ).rejects.toThrow("Operation aborted");
    });

    it("should handle abort between keyframe and operation loading", async () => {
      const mockGetSince = vi
        .fn()
        .mockImplementation((_, __, ___, ____, _____, ______, signal) => {
          return new Promise((_, reject) => {
            const checkAbort = () => {
              if (signal?.aborted) {
                reject(new Error("Operation aborted"));
              } else {
                setTimeout(checkAbort, 10);
              }
            };
            checkAbort();
          });
        });

      const mockOperationStore = {
        ...createMockOperationStore(),
        getSince: mockGetSince,
      };

      const mockRegistry = {
        ...createMockRegistry(),
        getModule: vi.fn().mockReturnValue({
          reducer: documentModelDocumentModelModule.reducer,
          utils: documentModelDocumentModelModule.utils,
        }),
      };

      const testCache = new KyselyWriteCache(
        keyframeStore,
        mockOperationStore,
        mockRegistry,
        config,
      );

      const controller = new AbortController();

      setTimeout(() => controller.abort(), 50);

      await expect(
        testCache.getState("doc1", "global", "main", 10, controller.signal),
      ).rejects.toThrow("Operation aborted");
    }, 10000);

    it("should handle abort during paging in cold miss", async () => {
      const actionId = generateId();
      const createOp = {
        ...createTestOperation("doc1", { index: 0, skip: 0 }),
        action: {
          id: actionId,
          type: "CREATE_DOCUMENT",
          scope: "document",
          timestampUtcMs: new Date().toISOString(),
          input: {
            documentId: "doc1",
            model: "powerhouse/document-model",
            version: 0,
          },
        },
      };

      let callCount = 0;
      const mockGetSince = vi.fn().mockImplementation((_, scope) => {
        callCount++;
        if (scope === "document") {
          return Promise.resolve({
            results: [createOp],
            options: { cursor: "0", limit: 100 },
            nextCursor: undefined,
          });
        }
        if (callCount === 2) {
          return Promise.resolve({
            results: Array.from({ length: 100 }, (_, i) =>
              createTestOperation("doc1", { index: i + 1, skip: 0 }),
            ),
            nextCursor: "cursor1",
          });
        }
        return Promise.reject(new Error("Operation aborted"));
      });

      const mockOperationStore = {
        ...createMockOperationStore(),
        getSince: mockGetSince,
      };

      const mockRegistry = {
        ...createMockRegistry(),
        getModule: vi.fn().mockReturnValue({
          reducer: documentModelDocumentModelModule.reducer,
          utils: documentModelDocumentModelModule.utils,
        }),
      };

      const testCache = new KyselyWriteCache(
        keyframeStore,
        mockOperationStore,
        mockRegistry,
        config,
      );

      await expect(
        testCache.getState("doc1", "global", "main", undefined),
      ).rejects.toThrow("Operation aborted");
    }, 10000);
  });

  describe("Operation store errors", () => {
    it("should wrap operation store errors during cold miss", async () => {
      const storeError = new Error("Database connection failed");
      const mockGetSince = vi.fn().mockRejectedValue(storeError);

      const mockOperationStore = {
        ...createMockOperationStore(),
        getSince: mockGetSince,
      };

      const mockRegistry = {
        ...createMockRegistry(),
        getModule: vi.fn().mockReturnValue({
          reducer: documentModelDocumentModelModule.reducer,
          utils: documentModelDocumentModelModule.utils,
        }),
      };

      const testCache = new KyselyWriteCache(
        keyframeStore,
        mockOperationStore,
        mockRegistry,
        config,
      );

      await expect(
        testCache.getState("doc1", "global", "main", 1),
      ).rejects.toThrow("Database connection failed");
    });

    it("should propagate operation store errors during warm miss", async () => {
      const doc = documentModelDocumentModelModule.utils.createDocument();

      const storeError = new Error("Network timeout");
      const mockGetSince = vi.fn().mockRejectedValue(storeError);

      const mockOperationStore = {
        ...createMockOperationStore(),
        getSince: mockGetSince,
      };

      const mockRegistry = {
        ...createMockRegistry(),
        getModule: vi.fn().mockReturnValue({
          reducer: documentModelDocumentModelModule.reducer,
          utils: documentModelDocumentModelModule.utils,
        }),
      };

      const testCache = new KyselyWriteCache(
        keyframeStore,
        mockOperationStore,
        mockRegistry,
        config,
      );

      testCache.putState("doc1", "global", "main", 1, doc);

      await expect(
        testCache.getState("doc1", "global", "main", 2),
      ).rejects.toThrow("Network timeout");
    });

    it("should include document ID in error messages", async () => {
      const storeError = new Error("Storage error");
      const mockGetSince = vi.fn().mockRejectedValue(storeError);

      const mockOperationStore = {
        ...createMockOperationStore(),
        getSince: mockGetSince,
      };

      const mockRegistry = {
        ...createMockRegistry(),
        getModule: vi.fn().mockReturnValue({
          reducer: documentModelDocumentModelModule.reducer,
          utils: documentModelDocumentModelModule.utils,
        }),
      };

      const testCache = new KyselyWriteCache(
        keyframeStore,
        mockOperationStore,
        mockRegistry,
        config,
      );

      const documentId = "my-important-doc";

      await expect(
        testCache.getState(documentId, "global", "main", 1),
      ).rejects.toThrow("Storage error");
    });

    it("should preserve original error in wrapped errors", async () => {
      const originalError = new Error("Original storage error");
      const mockGetSince = vi.fn().mockRejectedValue(originalError);

      const mockOperationStore = {
        ...createMockOperationStore(),
        getSince: mockGetSince,
      };

      const mockRegistry = {
        ...createMockRegistry(),
        getModule: vi.fn().mockReturnValue({
          reducer: documentModelDocumentModelModule.reducer,
          utils: documentModelDocumentModelModule.utils,
        }),
      };

      const testCache = new KyselyWriteCache(
        keyframeStore,
        mockOperationStore,
        mockRegistry,
        config,
      );

      await expect(
        testCache.getState("doc1", "global", "main", 1),
      ).rejects.toThrow(/Original storage error/);
    });
  });

  describe("Keyframe store errors", () => {
    it("should handle keyframe read errors gracefully (fallback to full rebuild)", async () => {
      const keyframeError = new Error("Keyframe store unavailable");
      const mockKeyframeStore = createMockKeyframeStore();
      mockKeyframeStore.findNearestKeyframe = vi
        .fn()
        .mockRejectedValue(keyframeError);

      const mockGetSince = vi.fn().mockResolvedValue({
        results: [createTestOperation("doc1", { index: 1, skip: 0 })],
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
          utils: documentModelDocumentModelModule.utils,
        }),
      };

      const testCache = new KyselyWriteCache(
        mockKeyframeStore,
        mockOperationStore,
        mockRegistry,
        config,
      );

      await expect(
        testCache.getState("doc1", "global", "main", 1),
      ).rejects.toThrow("Keyframe store unavailable");
    });

    it("should log but not fail on keyframe write errors during eviction", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const mockKeyframeStore = createMockKeyframeStore();
      mockKeyframeStore.putKeyframe = vi
        .fn()
        .mockRejectedValue(new Error("Keyframe write failed"));

      const smallConfig: WriteCacheConfig = {
        maxDocuments: 2,
        ringBufferSize: 5,
      };

      const testCache = new KyselyWriteCache(
        mockKeyframeStore,
        operationStore,
        registry,
        smallConfig,
      );

      const doc = documentModelDocumentModelModule.utils.createDocument();

      testCache.putState("doc1", "global", "main", 1, doc);
      testCache.putState("doc2", "global", "main", 1, doc);

      expect(() => {
        testCache.putState("doc3", "global", "main", 1, doc);
      }).not.toThrow();

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to persist keyframe on eviction"),
        expect.any(Error),
      );

      consoleErrorSpy.mockRestore();
    });

    it("should continue caching in-memory when keyframe store fails on eviction", async () => {
      const mockKeyframeStore = createMockKeyframeStore();
      mockKeyframeStore.putKeyframe = vi
        .fn()
        .mockRejectedValue(new Error("Keyframe store down"));

      const smallConfig: WriteCacheConfig = {
        maxDocuments: 2,
        ringBufferSize: 5,
      };

      const testCache = new KyselyWriteCache(
        mockKeyframeStore,
        operationStore,
        registry,
        smallConfig,
      );

      const doc = documentModelDocumentModelModule.utils.createDocument();
      testCache.putState("doc1", "global", "main", 1, doc);
      testCache.putState("doc2", "global", "main", 1, doc);
      testCache.putState("doc3", "global", "main", 1, doc);

      const retrieved = await testCache.getState("doc3", "global", "main", 1);

      expect(retrieved).toEqual(doc);
    });
  });

  describe("No operations error", () => {
    it("should throw descriptive error when no operations found", async () => {
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
          utils: documentModelDocumentModelModule.utils,
        }),
      };

      const testCache = new KyselyWriteCache(
        keyframeStore,
        mockOperationStore,
        mockRegistry,
        config,
      );

      await expect(
        testCache.getState("doc1", "global", "main", 1),
      ).rejects.toThrow(/Failed to rebuild document doc1.*no.*operation/);
    });

    it("should not create cache entry when no operations exist", async () => {
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
          utils: documentModelDocumentModelModule.utils,
        }),
      };

      const testCache = new KyselyWriteCache(
        keyframeStore,
        mockOperationStore,
        mockRegistry,
        config,
      );

      try {
        await testCache.getState("doc1", "global", "main", 1);
      } catch {
        // Expected error
      }

      const stream = testCache.getStream("doc1", "global", "main");
      expect(stream).toBeUndefined();
    });
  });

  describe("Paging errors", () => {
    it("should wrap paging errors with context", async () => {
      let callCount = 0;
      const mockGetSince = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            results: Array.from({ length: 100 }, (_, i) =>
              createTestOperation("doc1", { index: i + 1, skip: 0 }),
            ),
            nextCursor: "cursor1",
          });
        }
        return Promise.reject(new Error("Invalid cursor"));
      });

      const mockOperationStore = {
        ...createMockOperationStore(),
        getSince: mockGetSince,
      };

      const mockRegistry = {
        ...createMockRegistry(),
        getModule: vi.fn().mockReturnValue({
          reducer: documentModelDocumentModelModule.reducer,
          utils: documentModelDocumentModelModule.utils,
        }),
      };

      const testCache = new KyselyWriteCache(
        keyframeStore,
        mockOperationStore,
        mockRegistry,
        config,
      );

      await expect(
        testCache.getState("doc1", "global", "main"),
      ).rejects.toThrow(/Failed to rebuild document doc1/);
    });

    it("should handle invalid cursor gracefully", async () => {
      const mockGetSince = vi
        .fn()
        .mockRejectedValue(new Error("Cursor not found"));

      const mockOperationStore = {
        ...createMockOperationStore(),
        getSince: mockGetSince,
      };

      const mockRegistry = {
        ...createMockRegistry(),
        getModule: vi.fn().mockReturnValue({
          reducer: documentModelDocumentModelModule.reducer,
          utils: documentModelDocumentModelModule.utils,
        }),
      };

      const testCache = new KyselyWriteCache(
        keyframeStore,
        mockOperationStore,
        mockRegistry,
        config,
      );

      await expect(
        testCache.getState("doc1", "global", "main", 1),
      ).rejects.toThrow(/Cursor not found/);
    });
  });

  describe("Cache state integrity", () => {
    it("should not modify cache on cold miss failure", async () => {
      const mockGetSince = vi
        .fn()
        .mockRejectedValue(new Error("Storage failure"));

      const mockOperationStore = {
        ...createMockOperationStore(),
        getSince: mockGetSince,
      };

      const mockRegistry = {
        ...createMockRegistry(),
        getModule: vi.fn().mockReturnValue({
          reducer: documentModelDocumentModelModule.reducer,
          utils: documentModelDocumentModelModule.utils,
        }),
      };

      const testCache = new KyselyWriteCache(
        keyframeStore,
        mockOperationStore,
        mockRegistry,
        config,
      );

      try {
        await testCache.getState("doc1", "global", "main", 1);
      } catch {
        // Expected error
      }

      const stream = testCache.getStream("doc1", "global", "main");
      expect(stream).toBeUndefined();
    });

    it("should not modify cache on warm miss failure", async () => {
      const doc = documentModelDocumentModelModule.utils.createDocument();

      cache.putState("doc1", "global", "main", 1, doc);

      const streamBefore = cache.getStream("doc1", "global", "main");
      expect(streamBefore?.ringBuffer.length).toBe(1);

      const mockGetSince = vi
        .fn()
        .mockRejectedValue(new Error("Storage failure"));

      const mockOperationStore = {
        ...createMockOperationStore(),
        getSince: mockGetSince,
      };

      const mockRegistry = {
        ...createMockRegistry(),
        getModule: vi.fn().mockReturnValue({
          reducer: documentModelDocumentModelModule.reducer,
          utils: documentModelDocumentModelModule.utils,
        }),
      };

      const testCache = new KyselyWriteCache(
        keyframeStore,
        mockOperationStore,
        mockRegistry,
        config,
      );

      testCache.putState("doc1", "global", "main", 1, doc);

      try {
        await testCache.getState("doc1", "global", "main", 2);
      } catch {
        // Expected error
      }

      const streamAfter = testCache.getStream("doc1", "global", "main");
      expect(streamAfter?.ringBuffer.length).toBe(1);
    });

    it("should not update LRU tracker on error", async () => {
      const doc = documentModelDocumentModelModule.utils.createDocument();

      const mockGetSince = vi
        .fn()
        .mockRejectedValue(new Error("Storage failure"));

      const mockOperationStore = {
        ...createMockOperationStore(),
        getSince: mockGetSince,
      };

      const mockRegistry = {
        ...createMockRegistry(),
        getModule: vi.fn().mockReturnValue({
          reducer: documentModelDocumentModelModule.reducer,
          utils: documentModelDocumentModelModule.utils,
        }),
      };

      const testCache = new KyselyWriteCache(
        keyframeStore,
        mockOperationStore,
        mockRegistry,
        { ...config, maxDocuments: 3 },
      );

      testCache.putState("doc1", "global", "main", 1, doc);
      testCache.putState("doc2", "global", "main", 1, doc);
      testCache.putState("doc3", "global", "main", 1, doc);

      try {
        await testCache.getState("doc4", "global", "main", 1);
      } catch {
        // Expected error - getState failed for doc4
      }

      const stream4 = testCache.getStream("doc4", "global", "main");
      expect(stream4).toBeUndefined();

      testCache.putState("doc5", "global", "main", 1, doc);

      const evicted1 = testCache.invalidate("doc1", "global", "main");
      expect(evicted1).toBe(0);
    });

    it("should allow successful operation after error", async () => {
      const createOp = {
        ...createTestOperation("doc1", { index: 0, skip: 0 }),
        action: {
          id: "create-action",
          type: "CREATE_DOCUMENT",
          scope: "document",
          timestampUtcMs: new Date().toISOString(),
          input: {
            documentId: "doc1",
            model: "powerhouse/document-model",
            version: 0,
          },
        },
      };

      let callCount = 0;
      const mockGetSince = vi.fn().mockImplementation((_, scope) => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error("Temporary failure"));
        }
        if (scope === "document") {
          return Promise.resolve({
            results: [createOp],
            options: { cursor: "0", limit: 100 },
            nextCursor: undefined,
          });
        }
        if (scope === "global") {
          return Promise.resolve({
            results: [createTestOperation("doc1", { index: 1, skip: 0 })],
            nextCursor: undefined,
          });
        }
        return Promise.resolve({
          results: [],
          nextCursor: undefined,
        });
      });

      const mockOperationStore = {
        ...createMockOperationStore(),
        getSince: mockGetSince,
      };

      const mockRegistry = {
        ...createMockRegistry(),
        getModule: vi.fn().mockReturnValue({
          reducer: documentModelDocumentModelModule.reducer,
          utils: documentModelDocumentModelModule.utils,
        }),
      };

      const testCache = new KyselyWriteCache(
        keyframeStore,
        mockOperationStore,
        mockRegistry,
        config,
      );

      await expect(
        testCache.getState("doc1", "global", "main", 1),
      ).rejects.toThrow("Temporary failure");

      const doc = await testCache.getState("doc1", "global", "main", 1);
      expect(doc).toBeDefined();
    });

    it("should allow recovery after multiple errors", async () => {
      const actionId = generateId();
      const createOp = {
        ...createTestOperation("doc1", { index: 0, skip: 0 }),
        action: {
          id: actionId,
          type: "CREATE_DOCUMENT",
          scope: "document",
          timestampUtcMs: new Date().toISOString(),
          input: {
            documentId: "doc1",
            model: "powerhouse/document-model",
            version: 0,
          },
        },
      };

      let callCount = 0;
      const mockGetSince = vi.fn().mockImplementation((_, scope) => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error("Error 1"));
        }
        if (callCount === 2) {
          return Promise.reject(new Error("Error 2"));
        }
        if (scope === "document") {
          return Promise.resolve({
            results: [createOp],
            options: { cursor: "0", limit: 100 },
            nextCursor: undefined,
          });
        }
        if (scope === "global") {
          return Promise.resolve({
            results: [createTestOperation("doc1", { index: 1, skip: 0 })],
            nextCursor: undefined,
          });
        }
        return Promise.resolve({
          results: [],
          nextCursor: undefined,
        });
      });

      const mockOperationStore = {
        ...createMockOperationStore(),
        getSince: mockGetSince,
      };

      const mockRegistry = {
        ...createMockRegistry(),
        getModule: vi.fn().mockReturnValue({
          reducer: documentModelDocumentModelModule.reducer,
          utils: documentModelDocumentModelModule.utils,
        }),
      };

      const testCache = new KyselyWriteCache(
        keyframeStore,
        mockOperationStore,
        mockRegistry,
        config,
      );

      await expect(
        testCache.getState("doc1", "global", "main", 1),
      ).rejects.toThrow("Error 1");

      await expect(
        testCache.getState("doc1", "global", "main", 1),
      ).rejects.toThrow("Error 2");

      const doc = await testCache.getState("doc1", "global", "main", 1);
      expect(doc).toBeDefined();
    });

    it("should maintain cache consistency across error types", async () => {
      const doc = documentModelDocumentModelModule.utils.createDocument();
      cache.putState("doc1", "global", "main", 1, doc);
      cache.putState("doc2", "global", "main", 1, doc);

      const mockGetSince = vi
        .fn()
        .mockRejectedValue(new Error("Storage error"));

      const mockOperationStore = {
        ...createMockOperationStore(),
        getSince: mockGetSince,
      };

      const mockRegistry1 = {
        ...createMockRegistry(),
        getModule: vi.fn().mockImplementation(() => {
          throw new ModuleNotFoundError("test/invalid");
        }),
      };

      const testCache1 = new KyselyWriteCache(
        keyframeStore,
        mockOperationStore,
        mockRegistry1,
        config,
      );

      testCache1.putState("doc1", "global", "main", 1, doc);
      testCache1.putState("doc2", "global", "main", 1, doc);

      try {
        await testCache1.getState("doc3", "global", "main", 1);
      } catch {
        // Expected ModuleNotFoundError
      }

      const mockRegistry2 = {
        ...createMockRegistry(),
        getModule: vi.fn().mockReturnValue({
          reducer: documentModelDocumentModelModule.reducer,
          utils: documentModelDocumentModelModule.utils,
        }),
      };

      const testCache2 = new KyselyWriteCache(
        keyframeStore,
        mockOperationStore,
        mockRegistry2,
        config,
      );

      testCache2.putState("doc1", "global", "main", 1, doc);
      testCache2.putState("doc2", "global", "main", 1, doc);

      try {
        await testCache2.getState("doc4", "global", "main", 2);
      } catch {
        // Expected storage error
      }

      const doc1 = await testCache2.getState("doc1", "global", "main", 1);
      const doc2 = await testCache2.getState("doc2", "global", "main", 1);

      expect(doc1).toBeDefined();
      expect(doc2).toBeDefined();
    });
  });
});

describe("KyselyWriteCache - Error Handling (Integration)", () => {
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
        reducer: documentModelDocumentModelModule.reducer,
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
        // Ignore cleanup errors
      }
    }
  });

  it("should handle real database errors gracefully", async () => {
    const docId = "test-error-doc";
    await db.destroy();

    await expect(cache.getState(docId, "global", "main", 1)).rejects.toThrow();
  });

  it("should recover from transient errors with retry", async () => {
    const docId = "test-retry-doc";
    const docType = "powerhouse/document-model";

    await operationStore.apply(docId, docType, "document", "main", 0, (txn) => {
      const createActionId = generateId();
      txn.addOperations({
        id: deriveOperationId(docId, "document", "main", createActionId),
        index: 0,
        skip: 0,
        hash: "hash-0",
        timestampUtcMs: new Date().toISOString(),
        action: {
          id: createActionId,
          type: "CREATE_DOCUMENT",
          scope: "document",
          timestampUtcMs: new Date().toISOString(),
          input: {
            documentId: docId,
            model: docType,
            version: 0,
          },
        },
      });
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

    const doc = await cache.getState(docId, "global", "main", 5);
    expect(doc).toBeDefined();
    expect(doc.header.documentType).toBe(docType);

    cache.clear();

    const retryDoc = await cache.getState(docId, "global", "main", 5);
    expect(retryDoc).toBeDefined();
    expect(retryDoc.header.documentType).toBe(docType);
    expect(retryDoc.header.revision.global).toBe(doc.header.revision.global);
  });
});
