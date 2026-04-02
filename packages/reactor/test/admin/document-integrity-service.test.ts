import type { Operation } from "@powerhousedao/shared/document-model";
import {
  generateId,
  type Action,
  type PHDocument,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentIntegrityService } from "../../src/admin/document-integrity-service.js";
import { KyselyWriteCache } from "../../src/cache/kysely-write-cache.js";
import type { WriteCacheConfig } from "../../src/cache/write-cache-types.js";
import type { IDocumentModelRegistry } from "../../src/registry/interfaces.js";
import type {
  IDocumentView,
  IKeyframeStore,
  IOperationStore,
} from "../../src/storage/interfaces.js";
import {
  createCreateDocumentOperation,
  createTestOperation,
  createTestOperationStore,
  createUpgradeDocumentOperation,
} from "../factories.js";

function createMockDocumentView(
  getImpl?: (id: string) => Promise<PHDocument>,
): IDocumentView {
  return {
    name: "document-view",
    init: vi.fn().mockResolvedValue(undefined),
    indexOperations: vi.fn().mockResolvedValue(undefined),
    waitForConsistency: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue([]),
    get: getImpl
      ? (vi.fn(getImpl) as IDocumentView["get"])
      : (vi
          .fn()
          .mockRejectedValue(new Error("Not found")) as IDocumentView["get"]),
    getMany: vi.fn().mockResolvedValue([]),
    getByIdOrSlug: vi.fn().mockRejectedValue(new Error("Not found")),
    findByType: vi.fn().mockResolvedValue({
      results: [],
      options: { cursor: "0", limit: 100 },
    }),
    resolveSlug: vi.fn().mockResolvedValue(undefined),
    resolveSlugs: vi.fn().mockResolvedValue([]),
    resolveIdOrSlug: vi
      .fn()
      .mockImplementation((id: string) => Promise.resolve(id)),
  };
}

describe("DocumentIntegrityService", () => {
  let operationStore: IOperationStore;
  let keyframeStore: IKeyframeStore;
  let writeCache: KyselyWriteCache;
  let registry: IDocumentModelRegistry;
  let db: any;

  const docId = "test-integrity-doc";
  const docType = "powerhouse/document-model";
  const cacheConfig: WriteCacheConfig = {
    maxDocuments: 10,
    ringBufferSize: 5,
    keyframeInterval: 10,
  };

  beforeEach(async () => {
    const setup = await createTestOperationStore();
    operationStore = setup.store;
    keyframeStore = setup.keyframeStore;
    db = setup.db;

    registry = {
      registerModules: vi.fn(),
      unregisterModules: vi.fn(),
      getModule: vi.fn().mockReturnValue(documentModelDocumentModelModule),
      getAllModules: vi.fn(),
      clear: vi.fn(),
      getSupportedVersions: vi.fn(),
      getLatestVersion: vi.fn(),
      registerUpgradeManifests: vi.fn(),
      getUpgradeManifest: vi.fn(),
      computeUpgradePath: vi.fn(),
      getUpgradeReducer: vi.fn(),
    };

    writeCache = new KyselyWriteCache(
      keyframeStore,
      operationStore,
      registry,
      cacheConfig,
    );
    await writeCache.startup();
  });

  afterEach(async () => {
    await writeCache.shutdown();
    if (db) {
      try {
        await db.destroy();
      } catch {
        //
      }
    }
  });

  async function seedDocument(
    opCount: number,
    actionFactory?: (index: number) => Partial<Operation>,
  ) {
    const docOps: Operation[] = [createCreateDocumentOperation(docId, docType)];

    if (actionFactory) {
      const initialState =
        documentModelDocumentModelModule.utils.createDocument().state;
      docOps.push(
        createUpgradeDocumentOperation(
          docId,
          0,
          1,
          initialState as Record<string, unknown>,
        ),
      );
    }

    await operationStore.apply(docId, docType, "document", "main", 0, (txn) => {
      for (const op of docOps) {
        txn.addOperations(op);
      }
    });

    const operations: Operation[] = [];
    for (let i = 1; i <= opCount; i++) {
      const overrides = actionFactory ? actionFactory(i) : {};
      operations.push(
        createTestOperation(docId, { index: i, skip: 0, ...overrides }),
      );
    }

    await operationStore.apply(docId, docType, "global", "main", 0, (txn) => {
      for (const op of operations) {
        txn.addOperations(op);
      }
    });
  }

  function createService(
    documentView?: IDocumentView,
  ): DocumentIntegrityService {
    return new DocumentIntegrityService(
      keyframeStore,
      operationStore,
      writeCache,
      documentView ?? createMockDocumentView(),
      registry,
    );
  }

  it("should report consistent when no keyframes and no document view", async () => {
    await seedDocument(5);
    const service = createService();

    const result = await service.validateDocument(docId);

    expect(result.isConsistent).toBe(true);
    expect(result.keyframeIssues).toHaveLength(0);
    expect(result.snapshotIssues).toHaveLength(0);
  });

  it("should report consistent when keyframes match replayed state", async () => {
    await seedDocument(15);

    const doc10 = await writeCache.getState(docId, "global", "main", 10);
    await keyframeStore.putKeyframe(docId, "global", "main", 10, {
      ...doc10,
      operations: {},
      clipboard: [],
    });

    const service = createService();
    const result = await service.validateDocument(docId);

    expect(result.isConsistent).toBe(true);
    expect(result.keyframeIssues).toHaveLength(0);
  });

  it("should detect snapshot inconsistency when document view diverges", async () => {
    await seedDocument(5);

    const staleDoc = documentModelDocumentModelModule.utils.createDocument();
    (staleDoc.state as Record<string, unknown>).global = {
      staleData: true,
    };

    const documentView = createMockDocumentView(() =>
      Promise.resolve(staleDoc),
    );

    const service = createService(documentView);
    const result = await service.validateDocument(docId);

    expect(result.isConsistent).toBe(false);
    expect(result.snapshotIssues.length).toBeGreaterThan(0);
    expect(result.snapshotIssues[0].scope).toBe("global");
  });

  it("should delete keyframes with rebuildKeyframes", async () => {
    await seedDocument(15);

    const doc10 = await writeCache.getState(docId, "global", "main", 10);
    await keyframeStore.putKeyframe(docId, "global", "main", 10, {
      ...doc10,
      operations: {},
      clipboard: [],
    });

    const keyframesBefore = await keyframeStore.listKeyframes(
      docId,
      undefined,
      "main",
    );
    expect(keyframesBefore.length).toBeGreaterThan(0);

    const service = createService();
    const result = await service.rebuildKeyframes(docId);

    expect(result.keyframesDeleted).toBeGreaterThan(0);
    expect(result.scopesInvalidated).toBe(0);

    const keyframesAfter = await keyframeStore.listKeyframes(
      docId,
      undefined,
      "main",
    );
    expect(keyframesAfter).toHaveLength(0);
  });

  it("should invalidate scopes with rebuildSnapshots", async () => {
    await seedDocument(5);

    writeCache.putState(
      docId,
      "global",
      "main",
      5,
      documentModelDocumentModelModule.utils.createDocument(),
    );

    const streamBefore = writeCache.getStream(docId, "global", "main");
    expect(streamBefore).toBeDefined();

    const service = createService();
    const result = await service.rebuildSnapshots(docId);

    expect(result.scopesInvalidated).toBeGreaterThan(0);
    expect(result.keyframesDeleted).toBe(0);

    const streamAfter = writeCache.getStream(docId, "global", "main");
    expect(streamAfter).toBeUndefined();
  });

  it("should detect corrupt keyframe as inconsistent", async () => {
    await seedDocument(15);

    const doc10 = await writeCache.getState(docId, "global", "main", 10);
    const corruptDoc = structuredClone(doc10);
    (corruptDoc.state as Record<string, unknown>).global = {
      corruptData: true,
    };

    await keyframeStore.putKeyframe(docId, "global", "main", 10, {
      ...corruptDoc,
      operations: {},
      clipboard: [],
    });

    const service = createService();
    const result = await service.validateDocument(docId);

    expect(result.isConsistent).toBe(false);
    expect(result.keyframeIssues.length).toBeGreaterThan(0);
    expect(result.keyframeIssues[0].scope).toBe("global");
    expect(result.keyframeIssues[0].revision).toBe(10);
  });

  it("validation does not mutate production cache", async () => {
    await seedDocument(5);

    await writeCache.getState(docId, "global", "main");

    const streamBefore = writeCache.getStream(docId, "global", "main");
    expect(streamBefore).toBeDefined();

    const currentDoc = await writeCache.getState(docId, "global", "main");
    const documentView = createMockDocumentView(() =>
      Promise.resolve(currentDoc),
    );

    const service = createService(documentView);
    await service.validateDocument(docId);

    const streamAfter = writeCache.getStream(docId, "global", "main");
    expect(streamAfter).toBeDefined();
    expect(streamAfter).toBe(streamBefore);
  });

  it("corrupt keyframe does not cause false-positive snapshot issue", async () => {
    await seedDocument(15, (i) => ({
      action: {
        id: generateId(),
        type: "SET_MODEL_NAME",
        scope: "global",
        timestampUtcMs: new Date().toISOString(),
        input: { name: `Model Name ${i}` },
      } as Action,
    }));

    const correctDoc = await writeCache.getState(docId, "global", "main");
    expect((correctDoc.state as Record<string, unknown>).global).toHaveProperty(
      "name",
      "Model Name 15",
    );

    const doc10 = await writeCache.getState(docId, "global", "main", 10);
    const corruptDoc = structuredClone(doc10);
    (corruptDoc.state as Record<string, unknown>).global = {
      corruptData: true,
    };

    await keyframeStore.putKeyframe(docId, "global", "main", 10, {
      ...corruptDoc,
      operations: {},
      clipboard: [],
    });

    const documentView = createMockDocumentView(() =>
      Promise.resolve(correctDoc),
    );

    const service = createService(documentView);
    const result = await service.validateDocument(docId);

    expect(result.keyframeIssues.length).toBeGreaterThan(0);
    expect(result.snapshotIssues).toHaveLength(0);
  });

  it("should validate snapshots across all scopes from getRevisions", async () => {
    await seedDocument(5);

    const currentDoc = await writeCache.getState(docId, "global", "main");

    const documentView = createMockDocumentView(() =>
      Promise.resolve(currentDoc),
    );

    const service = createService(documentView);
    const result = await service.validateDocument(docId);

    expect(result.documentId).toBe(docId);
    expect(result.snapshotIssues).toHaveLength(0);
  });
});
