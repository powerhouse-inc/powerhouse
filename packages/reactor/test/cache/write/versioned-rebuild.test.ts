import type {
  Operation,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KyselyWriteCache } from "../../../src/cache/kysely-write-cache.js";
import type { WriteCacheConfig } from "../../../src/cache/write-cache-types.js";
import { DocumentModelRegistry } from "../../../src/registry/implementation.js";
import type { IDocumentModelRegistry } from "../../../src/registry/interfaces.js";
import type {
  IKeyframeStore,
  IOperationStore,
} from "../../../src/storage/interfaces.js";
import {
  createCreateDocumentOperation,
  createTestOperation,
  createTestOperationStore,
  createUpgradeDocumentOperation,
} from "../../factories.js";

const DOC_TYPE = "powerhouse/document-model";

function makeConfig(): WriteCacheConfig {
  return { maxDocuments: 10, ringBufferSize: 5, keyframeInterval: 100 };
}

function makeVersionedRegistry(
  getModuleFn: (
    docType: string,
    version?: number,
  ) => { reducer: (doc: PHDocument) => PHDocument },
  computeUpgradePathFn?: (
    docType: string,
    from: number,
    to: number,
  ) => unknown[],
): IDocumentModelRegistry {
  const base = new DocumentModelRegistry();
  base.registerModules(documentModelDocumentModelModule);
  return {
    registerModules: vi.fn(),
    unregisterModules: vi.fn(),
    getModule: vi.fn().mockImplementation(getModuleFn),
    getAllModules: vi.fn(),
    clear: vi.fn(),
    getSupportedVersions: vi.fn(),
    getLatestVersion: vi.fn(),
    registerUpgradeManifests: vi.fn(),
    unregisterUpgradeManifests: vi.fn(),
    getUpgradeManifest: vi.fn(),
    computeUpgradePath: vi.fn().mockImplementation(
      computeUpgradePathFn ??
        ((_dt, _from, _to) => {
          throw new Error("No manifest");
        }),
    ),
    getUpgradeReducer: vi.fn(),
  };
}

describe("KyselyWriteCache D7 - cold rebuild with validated upgrades", () => {
  let keyframeStore: IKeyframeStore;
  let operationStore: IOperationStore;
  let cache: KyselyWriteCache;
  let db: unknown;

  beforeEach(async () => {
    const setup = await createTestOperationStore();
    operationStore = setup.store;
    keyframeStore = setup.keyframeStore;
    db = setup.db;
  });

  afterEach(async () => {
    await cache?.shutdown();
    try {
      await (db as { destroy: () => Promise<void> }).destroy();
    } catch {
      // ignore
    }
  });

  it("uses upgradePath when manifest is registered and fromVersion>0", async () => {
    const docId = "d7-manifest-test";

    const spyV1Reducer = vi.fn().mockImplementation((doc: PHDocument) => doc);
    const spyV2Reducer = vi.fn().mockImplementation((doc: PHDocument) => doc);

    const getModuleFn = vi
      .fn()
      .mockImplementation((_dt: string, version?: number) => ({
        reducer: version === 1 ? spyV1Reducer : spyV2Reducer,
      }));

    const computeUpgradePathFn = vi.fn().mockReturnValue([]);

    const registry = makeVersionedRegistry(getModuleFn, computeUpgradePathFn);

    cache = new KyselyWriteCache(
      keyframeStore,
      operationStore,
      registry,
      makeConfig(),
    );
    await cache.startup();

    const t1 = "2024-01-01T00:00:01.000Z";
    const t2 = "2024-01-01T00:00:02.000Z";
    const t3 = "2024-01-01T00:00:03.000Z";
    const t4 = "2024-01-01T00:00:04.000Z";
    const t5 = "2024-01-01T00:00:05.000Z";

    await operationStore.apply(
      docId,
      DOC_TYPE,
      "document",
      "main",
      0,
      (txn) => {
        txn.addOperations(
          createCreateDocumentOperation(docId, DOC_TYPE, {
            timestampUtcMs: t1,
          }),
        );
        txn.addOperations(
          createUpgradeDocumentOperation(
            docId,
            0,
            1,
            {},
            { index: 1, timestampUtcMs: t2 },
          ),
        );
        txn.addOperations(
          createUpgradeDocumentOperation(
            docId,
            1,
            2,
            {},
            {
              index: 2,
              timestampUtcMs: t4,
              action: {
                id: "upgrade-2",
                type: "UPGRADE_DOCUMENT",
                scope: "document",
                timestampUtcMs: t4,
                input: {
                  documentId: docId,
                  fromVersion: 1,
                  toVersion: 2,
                  revision: { global: 2 },
                },
              },
            },
          ),
        );
      },
    );

    const globalOps: Operation[] = [
      createTestOperation(docId, { index: 1, skip: 0, timestampUtcMs: t3 }),
      createTestOperation(docId, { index: 2, skip: 0, timestampUtcMs: t5 }),
    ];

    await operationStore.apply(docId, DOC_TYPE, "global", "main", 0, (txn) => {
      for (const op of globalOps) {
        txn.addOperations(op);
      }
    });

    await cache.getState(docId, "global", "main");

    expect(computeUpgradePathFn).toHaveBeenCalledWith(DOC_TYPE, 1, 2);
  });

  it("proceeds without upgradePath when manifest missing but initialState present", async () => {
    const docId = "d7-no-manifest-with-state";

    const registry = makeVersionedRegistry((_dt, _v) => ({
      reducer: (doc: PHDocument) => doc,
    }));

    cache = new KyselyWriteCache(
      keyframeStore,
      operationStore,
      registry,
      makeConfig(),
    );
    await cache.startup();

    await operationStore.apply(
      docId,
      DOC_TYPE,
      "document",
      "main",
      0,
      (txn) => {
        txn.addOperations(createCreateDocumentOperation(docId, DOC_TYPE));
        txn.addOperations(
          createUpgradeDocumentOperation(
            docId,
            1,
            2,
            { document: { version: 2 } },
            { index: 1 },
          ),
        );
      },
    );

    await expect(
      cache.getState(docId, "global", "main"),
    ).resolves.toBeDefined();
  });

  it("throws descriptive error when manifest missing and no initialState", async () => {
    const docId = "d7-no-manifest-no-state";

    const registry = makeVersionedRegistry((_dt, _v) => ({
      reducer: (doc: PHDocument) => doc,
    }));

    cache = new KyselyWriteCache(
      keyframeStore,
      operationStore,
      registry,
      makeConfig(),
    );
    await cache.startup();

    const upgradeOp = createUpgradeDocumentOperation(
      docId,
      1,
      2,
      {},
      { index: 1 },
    );
    upgradeOp.action = {
      ...upgradeOp.action,
      input: {
        documentId: docId,
        fromVersion: 1,
        toVersion: 2,
      },
    } as typeof upgradeOp.action;

    await operationStore.apply(
      docId,
      DOC_TYPE,
      "document",
      "main",
      0,
      (txn) => {
        txn.addOperations(createCreateDocumentOperation(docId, DOC_TYPE));
        txn.addOperations(upgradeOp);
      },
    );

    await expect(cache.getState(docId, "global", "main")).rejects.toThrow(
      /no upgrade manifest.*no initialState/,
    );
  });

  it("uses v1 module for ops before upgrade boundary (revision-based)", async () => {
    const docId = "d7-segment-revision";

    const v1ReducerCalls: number[] = [];
    const v2ReducerCalls: number[] = [];

    const v1Reducer = vi
      .fn()
      .mockImplementation(
        (doc: PHDocument, action: { input: { index?: number } }) => {
          v1ReducerCalls.push(action?.input?.index ?? -1);
          return doc;
        },
      );
    const v2Reducer = vi
      .fn()
      .mockImplementation(
        (doc: PHDocument, action: { input: { index?: number } }) => {
          v2ReducerCalls.push(action?.input?.index ?? -1);
          return doc;
        },
      );

    const getModuleFn = vi
      .fn()
      .mockImplementation((_dt: string, version?: number) => ({
        reducer:
          version === 1 ? v1Reducer : version === 2 ? v2Reducer : v2Reducer,
      }));
    const computeUpgradePathFn = vi.fn().mockReturnValue([]);

    const registry = makeVersionedRegistry(getModuleFn, computeUpgradePathFn);
    cache = new KyselyWriteCache(
      keyframeStore,
      operationStore,
      registry,
      makeConfig(),
    );
    await cache.startup();

    const t1 = "2024-01-01T00:00:01.000Z";
    const t2 = "2024-01-01T00:00:02.000Z";
    const t3 = "2024-01-01T00:00:03.000Z";
    const t4 = "2024-01-01T00:00:04.000Z";

    await operationStore.apply(
      docId,
      DOC_TYPE,
      "document",
      "main",
      0,
      (txn) => {
        txn.addOperations(
          createCreateDocumentOperation(docId, DOC_TYPE, {
            timestampUtcMs: t1,
          }),
        );
        txn.addOperations(
          createUpgradeDocumentOperation(
            docId,
            0,
            1,
            {},
            { index: 1, timestampUtcMs: t2 },
          ),
        );
        const upgradeAction = {
          id: "upgrade-validated",
          type: "UPGRADE_DOCUMENT",
          scope: "document",
          timestampUtcMs: t3,
          input: {
            documentId: docId,
            fromVersion: 1,
            toVersion: 2,
            revision: { global: 1 },
          },
        };
        txn.addOperations({
          id: "op-doc-2",
          index: 2,
          skip: 0,
          hash: "hash-2",
          timestampUtcMs: t3,
          action: upgradeAction as typeof upgradeAction & { type: string },
        });
      },
    );

    const op1 = createTestOperation(docId, {
      index: 1,
      skip: 0,
      timestampUtcMs: t4,
    });

    await operationStore.apply(docId, DOC_TYPE, "global", "main", 0, (txn) => {
      txn.addOperations(
        createTestOperation(docId, { index: 0, skip: 0, timestampUtcMs: t2 }),
      );
      txn.addOperations(op1);
    });

    await cache.getState(docId, "global", "main");

    const v1Calls = getModuleFn.mock.calls.filter(
      (c: unknown[]) => c[0] === DOC_TYPE && c[1] === 1,
    );
    const v2Calls = getModuleFn.mock.calls.filter(
      (c: unknown[]) => c[0] === DOC_TYPE && c[1] === 2,
    );
    expect(v1Calls.length).toBeGreaterThan(0);
    expect(v2Calls.length).toBeGreaterThan(0);
    expect(v1ReducerCalls.length).toBeGreaterThan(0);
    expect(v2ReducerCalls.length).toBeGreaterThan(0);
  });
});

describe("KyselyWriteCache D8 - warm rebuild version pinning", () => {
  let keyframeStore: IKeyframeStore;
  let operationStore: IOperationStore;
  let cache: KyselyWriteCache;
  let db: unknown;

  beforeEach(async () => {
    const setup = await createTestOperationStore();
    operationStore = setup.store;
    keyframeStore = setup.keyframeStore;
    db = setup.db;
  });

  afterEach(async () => {
    await cache?.shutdown();
    try {
      await (db as { destroy: () => Promise<void> }).destroy();
    } catch {
      // ignore
    }
  });

  it("uses pinned version from base document in warm rebuild", async () => {
    const docId = "d8-version-pin";

    const getModuleFn = vi
      .fn()
      .mockImplementation((_dt: string, version?: number) => ({
        reducer: (doc: PHDocument) => doc,
        version,
      }));

    const registry = makeVersionedRegistry(
      getModuleFn,
      (_dt, _from, _to) => [],
    );
    cache = new KyselyWriteCache(
      keyframeStore,
      operationStore,
      registry,
      makeConfig(),
    );
    await cache.startup();

    await operationStore.apply(
      docId,
      DOC_TYPE,
      "document",
      "main",
      0,
      (txn) => {
        txn.addOperations(createCreateDocumentOperation(docId, DOC_TYPE));
        txn.addOperations(
          createUpgradeDocumentOperation(
            docId,
            0,
            2,
            { document: { version: 2 } },
            { index: 1 },
          ),
        );
      },
    );

    const globalOps: Operation[] = [];
    for (let i = 1; i <= 20; i++) {
      globalOps.push(createTestOperation(docId, { index: i, skip: 0 }));
    }
    await operationStore.apply(docId, DOC_TYPE, "global", "main", 0, (txn) => {
      for (const op of globalOps) {
        txn.addOperations(op);
      }
    });

    getModuleFn.mockClear();

    const doc10 = await cache.getState(docId, "global", "main", 10);
    expect(doc10.state.document.version).toBe(2);

    getModuleFn.mockClear();

    await cache.getState(docId, "global", "main", 15);

    const warmCalls = getModuleFn.mock.calls;
    const callsWithVersion2 = warmCalls.filter(
      (c: unknown[]) => c[0] === DOC_TYPE && (c[1] === 2 || c[1] === undefined),
    );
    expect(callsWithVersion2.length).toBeGreaterThan(0);
    const callsWithVersion1 = warmCalls.filter(
      (c: unknown[]) => c[0] === DOC_TYPE && c[1] === 1,
    );
    expect(callsWithVersion1.length).toBe(0);
  });

  it("falls back to cold rebuild when new UPGRADE_DOCUMENT found in document scope", async () => {
    const docId = "d8-upgrade-fallback";

    const coldRebuildSpy = vi.fn();
    const getModuleFn = vi
      .fn()
      .mockImplementation((_dt: string, _version?: number) => ({
        reducer: (doc: PHDocument) => {
          coldRebuildSpy();
          return doc;
        },
      }));

    const registry = makeVersionedRegistry(
      getModuleFn,
      (_dt, _from, _to) => [],
    );
    cache = new KyselyWriteCache(
      keyframeStore,
      operationStore,
      registry,
      makeConfig(),
    );
    await cache.startup();

    await operationStore.apply(
      docId,
      DOC_TYPE,
      "document",
      "main",
      0,
      (txn) => {
        txn.addOperations(createCreateDocumentOperation(docId, DOC_TYPE));
        txn.addOperations(
          createUpgradeDocumentOperation(
            docId,
            0,
            1,
            { document: { version: 1 } },
            { index: 1 },
          ),
        );
      },
    );

    const globalOpsPhase1: Operation[] = [];
    for (let i = 1; i <= 10; i++) {
      globalOpsPhase1.push(createTestOperation(docId, { index: i, skip: 0 }));
    }
    await operationStore.apply(docId, DOC_TYPE, "global", "main", 0, (txn) => {
      for (const op of globalOpsPhase1) {
        txn.addOperations(op);
      }
    });

    const base = await cache.getState(docId, "global", "main", 5);
    expect(base).toBeDefined();

    await operationStore.apply(
      docId,
      DOC_TYPE,
      "document",
      "main",
      2,
      (txn) => {
        txn.addOperations(
          createUpgradeDocumentOperation(
            docId,
            1,
            2,
            { document: { version: 2 } },
            {
              index: 2,
              timestampUtcMs: new Date().toISOString(),
            },
          ),
        );
      },
    );

    const globalOpsPhase2: Operation[] = [];
    for (let i = 11; i <= 15; i++) {
      globalOpsPhase2.push(createTestOperation(docId, { index: i, skip: 0 }));
    }
    await operationStore.apply(docId, DOC_TYPE, "global", "main", 11, (txn) => {
      for (const op of globalOpsPhase2) {
        txn.addOperations(op);
      }
    });

    const result = await cache.getState(docId, "global", "main", 15);
    expect(result).toBeDefined();

    expect(result.state.document.version).toBe(2);
  });

  it("does not fall back to cold when no UPGRADE_DOCUMENT in new document-scope ops", async () => {
    const docId = "d8-no-fallback";

    const getModuleFn = vi
      .fn()
      .mockImplementation((_dt: string, _version?: number) => ({
        reducer: (doc: PHDocument) => doc,
      }));

    const registry = makeVersionedRegistry(
      getModuleFn,
      (_dt, _from, _to) => [],
    );
    cache = new KyselyWriteCache(
      keyframeStore,
      operationStore,
      registry,
      makeConfig(),
    );
    await cache.startup();

    await operationStore.apply(
      docId,
      DOC_TYPE,
      "document",
      "main",
      0,
      (txn) => {
        txn.addOperations(createCreateDocumentOperation(docId, DOC_TYPE));
        txn.addOperations(
          createUpgradeDocumentOperation(
            docId,
            0,
            1,
            { document: { version: 1 } },
            { index: 1 },
          ),
        );
      },
    );

    const globalOps: Operation[] = [];
    for (let i = 1; i <= 20; i++) {
      globalOps.push(createTestOperation(docId, { index: i, skip: 0 }));
    }
    await operationStore.apply(docId, DOC_TYPE, "global", "main", 0, (txn) => {
      for (const op of globalOps) {
        txn.addOperations(op);
      }
    });

    await cache.getState(docId, "global", "main", 10);

    getModuleFn.mockClear();

    const result = await cache.getState(docId, "global", "main", 15);
    expect(result).toBeDefined();

    const docScopeFullRebuildCalls = getModuleFn.mock.calls.filter(
      (c: unknown[]) => c[0] === DOC_TYPE && c[1] === undefined,
    );
    expect(docScopeFullRebuildCalls.length).toBeLessThan(5);
  });
});
