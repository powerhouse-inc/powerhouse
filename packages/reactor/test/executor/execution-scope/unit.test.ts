import { beforeEach, describe, expect, it, vi } from "vitest";
import { CollectionMembershipCache } from "../../../src/cache/collection-membership-cache.js";
import { DocumentMetaCache } from "../../../src/cache/document-meta-cache.js";
import type { IOperationIndex } from "../../../src/cache/operation-index-types.js";
import { KyselyWriteCache } from "../../../src/cache/kysely-write-cache.js";
import { DefaultExecutionScope } from "../../../src/executor/execution-scope.js";
import type { IOperationStore } from "../../../src/storage/interfaces.js";
import type { IKeyframeStore } from "../../../src/storage/interfaces.js";
import type { IDocumentModelRegistry } from "../../../src/registry/interfaces.js";
import {
  createMockCollectionMembershipCache,
  createMockDocumentMetaCache,
  createMockOperationStore,
} from "../../factories.js";

describe("DefaultExecutionScope", () => {
  it("should pass stores through unchanged", async () => {
    const operationStore = createMockOperationStore();
    const operationIndex: IOperationIndex = {
      start: vi.fn(),
      commit: vi.fn(),
      find: vi.fn(),
      get: vi.fn(),
      getSinceOrdinal: vi.fn(),
      getLatestTimestampForCollection: vi.fn(),
      getCollectionsForDocuments: vi.fn(),
    } as unknown as IOperationIndex;
    const writeCache = {
      getState: vi.fn(),
      putState: vi.fn(),
      invalidate: vi.fn(),
      clear: vi.fn(),
      startup: vi.fn(),
      shutdown: vi.fn(),
    };
    const documentMetaCache = createMockDocumentMetaCache();
    const collectionMembershipCache = createMockCollectionMembershipCache();

    const scope = new DefaultExecutionScope(
      operationStore,
      operationIndex,
      writeCache,
      documentMetaCache,
      collectionMembershipCache,
    );

    const stores = await scope.run((s) => Promise.resolve(s));

    expect(stores.operationStore).toBe(operationStore);
    expect(stores.operationIndex).toBe(operationIndex);
    expect(stores.writeCache).toBe(writeCache);
    expect(stores.documentMetaCache).toBe(documentMetaCache);
    expect(stores.collectionMembershipCache).toBe(collectionMembershipCache);
  });

  it("should throw immediately when signal is already aborted", async () => {
    const operationStore = createMockOperationStore();
    const operationIndex: IOperationIndex = {
      start: vi.fn(),
      commit: vi.fn(),
      find: vi.fn(),
      get: vi.fn(),
      getSinceOrdinal: vi.fn(),
      getLatestTimestampForCollection: vi.fn(),
      getCollectionsForDocuments: vi.fn(),
    } as unknown as IOperationIndex;
    const writeCache = {
      getState: vi.fn(),
      putState: vi.fn(),
      invalidate: vi.fn(),
      clear: vi.fn(),
      startup: vi.fn(),
      shutdown: vi.fn(),
    };
    const documentMetaCache = createMockDocumentMetaCache();
    const collectionMembershipCache = createMockCollectionMembershipCache();

    const scope = new DefaultExecutionScope(
      operationStore,
      operationIndex,
      writeCache,
      documentMetaCache,
      collectionMembershipCache,
    );

    const controller = new AbortController();
    controller.abort(new Error("pre-aborted"));

    const fn = vi.fn().mockResolvedValue("should not run");

    await expect(scope.run(fn, controller.signal)).rejects.toThrow(
      "pre-aborted",
    );
    expect(fn).not.toHaveBeenCalled();
  });

  it("should not throw when signal is not aborted", async () => {
    const operationStore = createMockOperationStore();
    const operationIndex: IOperationIndex = {
      start: vi.fn(),
      commit: vi.fn(),
      find: vi.fn(),
      get: vi.fn(),
      getSinceOrdinal: vi.fn(),
      getLatestTimestampForCollection: vi.fn(),
      getCollectionsForDocuments: vi.fn(),
    } as unknown as IOperationIndex;
    const writeCache = {
      getState: vi.fn(),
      putState: vi.fn(),
      invalidate: vi.fn(),
      clear: vi.fn(),
      startup: vi.fn(),
      shutdown: vi.fn(),
    };
    const documentMetaCache = createMockDocumentMetaCache();
    const collectionMembershipCache = createMockCollectionMembershipCache();

    const scope = new DefaultExecutionScope(
      operationStore,
      operationIndex,
      writeCache,
      documentMetaCache,
      collectionMembershipCache,
    );

    const result = await scope.run(
      () => Promise.resolve("ok"),
      new AbortController().signal,
    );
    expect(result).toBe("ok");
  });
});

describe("KyselyWriteCache.withScopedStores", () => {
  let originalCache: KyselyWriteCache;
  let mockKeyframeStore: IKeyframeStore;
  let mockOperationStore: IOperationStore;
  let mockRegistry: IDocumentModelRegistry;

  beforeEach(() => {
    mockKeyframeStore = {
      putKeyframe: vi.fn().mockResolvedValue(undefined),
      findNearestKeyframe: vi.fn().mockResolvedValue(undefined),
      listKeyframes: vi.fn().mockResolvedValue([]),
      deleteKeyframes: vi.fn().mockResolvedValue(0),
    };
    mockOperationStore = createMockOperationStore();
    mockRegistry = {
      getModule: vi.fn(),
      registerModules: vi.fn(),
      getModules: vi.fn(),
    } as unknown as IDocumentModelRegistry;

    originalCache = new KyselyWriteCache(
      mockKeyframeStore,
      mockOperationStore,
      mockRegistry,
      { maxDocuments: 10, ringBufferSize: 5, keyframeInterval: 10 },
    );
  });

  it("should share streams between scoped and original", () => {
    const scopedKeyframeStore: IKeyframeStore = {
      putKeyframe: vi.fn().mockResolvedValue(undefined),
      findNearestKeyframe: vi.fn().mockResolvedValue(undefined),
      listKeyframes: vi.fn().mockResolvedValue([]),
      deleteKeyframes: vi.fn().mockResolvedValue(0),
    };
    const scopedOperationStore = createMockOperationStore();

    const doc = {
      header: {
        id: "doc-1",
        documentType: "test/type",
        revision: { global: 1 },
      },
      operations: { global: [{ index: 0 }] },
      state: {},
      clipboard: [],
    } as any;

    originalCache.putState("doc-1", "global", "main", 0, doc);

    const scoped = originalCache.withScopedStores(
      scopedOperationStore,
      scopedKeyframeStore,
    );

    const stream = scoped.getStream("doc-1", "global", "main");
    expect(stream).toBeDefined();

    const originalStream = originalCache.getStream("doc-1", "global", "main");
    expect(stream).toBe(originalStream);
  });

  it("should share putState from scoped to original", () => {
    const scopedKeyframeStore: IKeyframeStore = {
      putKeyframe: vi.fn().mockResolvedValue(undefined),
      findNearestKeyframe: vi.fn().mockResolvedValue(undefined),
      listKeyframes: vi.fn().mockResolvedValue([]),
      deleteKeyframes: vi.fn().mockResolvedValue(0),
    };
    const scopedOperationStore = createMockOperationStore();

    const scoped = originalCache.withScopedStores(
      scopedOperationStore,
      scopedKeyframeStore,
    );

    const doc = {
      header: {
        id: "doc-1",
        documentType: "test/type",
        revision: { global: 1 },
      },
      operations: { global: [{ index: 0 }] },
      state: {},
      clipboard: [],
    } as any;

    scoped.putState("doc-1", "global", "main", 0, doc);

    const originalStream = originalCache.getStream("doc-1", "global", "main");
    expect(originalStream).toBeDefined();
  });

  it("should use provided stores for DB reads", async () => {
    const scopedKeyframeStore: IKeyframeStore = {
      putKeyframe: vi.fn().mockResolvedValue(undefined),
      findNearestKeyframe: vi.fn().mockResolvedValue(undefined),
      listKeyframes: vi.fn().mockResolvedValue([]),
      deleteKeyframes: vi.fn().mockResolvedValue(0),
    };

    const createOp = {
      index: 0,
      timestampUtcMs: new Date().toISOString(),
      hash: "",
      skip: 0,
      action: {
        id: "a1",
        type: "CREATE_DOCUMENT",
        scope: "document",
        timestampUtcMs: new Date().toISOString(),
        input: { documentId: "doc-1", model: "test/type" },
      },
    };

    const scopedOperationStore = createMockOperationStore({
      getSince: vi.fn().mockResolvedValue({
        results: [createOp],
        options: { cursor: "0", limit: 100 },
        nextCursor: undefined,
      }),
      getRevisions: vi.fn().mockResolvedValue({
        revision: { document: 1 },
        latestTimestamp: new Date().toISOString(),
      }),
    });

    const mockModule = {
      reducer: vi.fn().mockImplementation((doc: any) => doc),
    };
    const registryWithModule = {
      getModule: vi.fn().mockReturnValue(mockModule),
      registerModules: vi.fn(),
      getModules: vi.fn(),
    } as unknown as IDocumentModelRegistry;

    const cacheWithRegistry = new KyselyWriteCache(
      mockKeyframeStore,
      mockOperationStore,
      registryWithModule,
      { maxDocuments: 10, ringBufferSize: 5, keyframeInterval: 10 },
    );

    const scoped = cacheWithRegistry.withScopedStores(
      scopedOperationStore,
      scopedKeyframeStore,
    );

    await scoped.getState("doc-1", "document", "main");

    expect(scopedOperationStore.getSince).toHaveBeenCalled();
    expect(mockOperationStore.getSince).not.toHaveBeenCalled();
  });
});

describe("KyselyWriteCache isolation", () => {
  let originalCache: KyselyWriteCache;
  let mockKeyframeStore: IKeyframeStore;
  let mockOperationStore: IOperationStore;
  let mockRegistry: IDocumentModelRegistry;

  beforeEach(() => {
    mockKeyframeStore = {
      putKeyframe: vi.fn().mockResolvedValue(undefined),
      findNearestKeyframe: vi.fn().mockResolvedValue(undefined),
      listKeyframes: vi.fn().mockResolvedValue([]),
      deleteKeyframes: vi.fn().mockResolvedValue(0),
    };
    mockOperationStore = createMockOperationStore();
    mockRegistry = {
      getModule: vi.fn(),
      registerModules: vi.fn(),
      getModules: vi.fn(),
    } as unknown as IDocumentModelRegistry;

    originalCache = new KyselyWriteCache(
      mockKeyframeStore,
      mockOperationStore,
      mockRegistry,
      { maxDocuments: 10, ringBufferSize: 5, keyframeInterval: 10 },
    );
  });

  it("isolated cache does not share streams with parent", () => {
    const doc = {
      header: {
        id: "doc-1",
        documentType: "test/type",
        revision: { global: 1 },
      },
      operations: { global: [{ index: 0 }] },
      state: {},
      clipboard: [],
    } as any;

    originalCache.putState("doc-1", "global", "main", 0, doc);

    const isolated = new KyselyWriteCache(
      mockKeyframeStore,
      mockOperationStore,
      mockRegistry,
      { maxDocuments: 10, ringBufferSize: 5, keyframeInterval: 10 },
    );

    expect(isolated.getStream("doc-1", "global", "main")).toBeUndefined();

    isolated.putState("doc-1", "global", "main", 1, doc);
    const originalStream = originalCache.getStream("doc-1", "global", "main");
    const isolatedStream = isolated.getStream("doc-1", "global", "main");
    expect(originalStream).not.toBe(isolatedStream);
  });

  it("invalidate on isolated cache does not affect parent", () => {
    const doc = {
      header: {
        id: "doc-1",
        documentType: "test/type",
        revision: { global: 1 },
      },
      operations: { global: [{ index: 0 }] },
      state: {},
      clipboard: [],
    } as any;

    originalCache.putState("doc-1", "global", "main", 0, doc);

    const isolated = new KyselyWriteCache(
      mockKeyframeStore,
      mockOperationStore,
      mockRegistry,
      { maxDocuments: 10, ringBufferSize: 5, keyframeInterval: 10 },
    );

    isolated.invalidate("doc-1", "global", "main");

    const parentStream = originalCache.getStream("doc-1", "global", "main");
    expect(parentStream).toBeDefined();
  });
});

describe("DocumentMetaCache.withScopedStore", () => {
  let originalCache: DocumentMetaCache;
  let mockOperationStore: IOperationStore;

  beforeEach(() => {
    mockOperationStore = createMockOperationStore();
    originalCache = new DocumentMetaCache(mockOperationStore, {
      maxDocuments: 100,
    });
  });

  it("should share cache between scoped and original", async () => {
    const scopedOperationStore = createMockOperationStore();

    originalCache.putDocumentMeta("doc-1", "main", {
      state: { version: 1 },
      documentType: "test/type",
      documentScopeRevision: 1,
    } as any);

    const scoped = originalCache.withScopedStore(scopedOperationStore);

    const meta = await scoped.getDocumentMeta("doc-1", "main");
    expect(meta.documentType).toBe("test/type");
    expect(scopedOperationStore.getSince).not.toHaveBeenCalled();
  });

  it("should share putDocumentMeta from scoped to original", async () => {
    const scopedOperationStore = createMockOperationStore();
    const scoped = originalCache.withScopedStore(scopedOperationStore);

    scoped.putDocumentMeta("doc-2", "main", {
      state: { version: 2 },
      documentType: "test/type-2",
      documentScopeRevision: 1,
    } as any);

    const meta = await originalCache.getDocumentMeta("doc-2", "main");
    expect(meta.documentType).toBe("test/type-2");
    expect(mockOperationStore.getSince).not.toHaveBeenCalled();
  });

  it("should use provided store for cache misses", async () => {
    const createOp = {
      index: 0,
      timestampUtcMs: new Date().toISOString(),
      hash: "",
      skip: 0,
      action: {
        id: "a1",
        type: "CREATE_DOCUMENT",
        scope: "document",
        timestampUtcMs: new Date().toISOString(),
        input: { documentId: "doc-miss", model: "test/type" },
      },
    };

    const scopedOperationStore = createMockOperationStore({
      getSince: vi.fn().mockResolvedValue({
        results: [createOp],
        options: { cursor: "0", limit: 100 },
        nextCursor: undefined,
      }),
    });

    const scoped = originalCache.withScopedStore(scopedOperationStore);

    const meta = await scoped.getDocumentMeta("doc-miss", "main");
    expect(meta.documentType).toBe("test/type");
    expect(scopedOperationStore.getSince).toHaveBeenCalled();
    expect(mockOperationStore.getSince).not.toHaveBeenCalled();
  });
});

describe("CollectionMembershipCache.withScopedIndex", () => {
  let originalCache: CollectionMembershipCache;
  let mockIndex: IOperationIndex;

  beforeEach(() => {
    mockIndex = {
      start: vi.fn(),
      commit: vi.fn(),
      find: vi.fn(),
      get: vi.fn(),
      getSinceOrdinal: vi.fn(),
      getLatestTimestampForCollection: vi.fn(),
      getCollectionsForDocuments: vi
        .fn()
        .mockResolvedValue({ "doc-1": ["col-1"] }),
    } as unknown as IOperationIndex;

    originalCache = new CollectionMembershipCache(mockIndex);
  });

  it("should share cache between scoped and original", async () => {
    await originalCache.getCollectionsForDocuments(["doc-1"]);

    const scopedIndex = {
      ...mockIndex,
      getCollectionsForDocuments: vi.fn().mockResolvedValue({}),
    } as unknown as IOperationIndex;

    const scoped = originalCache.withScopedIndex(scopedIndex);

    const result = await scoped.getCollectionsForDocuments(["doc-1"]);
    expect(result["doc-1"]).toEqual(["col-1"]);
    expect(scopedIndex.getCollectionsForDocuments).not.toHaveBeenCalled();
  });

  it("should use provided index for cache misses", async () => {
    const scopedIndex = {
      ...mockIndex,
      getCollectionsForDocuments: vi
        .fn()
        .mockResolvedValue({ "doc-2": ["col-2"] }),
    } as unknown as IOperationIndex;

    const scoped = originalCache.withScopedIndex(scopedIndex);

    const result = await scoped.getCollectionsForDocuments(["doc-2"]);
    expect(result["doc-2"]).toEqual(["col-2"]);
    expect(scopedIndex.getCollectionsForDocuments).toHaveBeenCalled();
    expect(mockIndex.getCollectionsForDocuments).not.toHaveBeenCalled();
  });

  it("should reflect invalidation across both instances", async () => {
    await originalCache.getCollectionsForDocuments(["doc-1"]);

    const scopedIndex = {
      ...mockIndex,
      getCollectionsForDocuments: vi
        .fn()
        .mockResolvedValue({ "doc-1": ["col-new"] }),
    } as unknown as IOperationIndex;

    const scoped = originalCache.withScopedIndex(scopedIndex);

    scoped.invalidate("doc-1");

    await originalCache.getCollectionsForDocuments(["doc-1"]);
    expect(mockIndex.getCollectionsForDocuments).toHaveBeenCalledTimes(2);
  });
});
