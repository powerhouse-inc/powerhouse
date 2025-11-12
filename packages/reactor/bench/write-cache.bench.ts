import { driveDocumentModelModule } from "document-drive";
import type { PHDocument } from "document-model";
import { afterEach, bench, describe } from "vitest";
import { KyselyWriteCache } from "../src/cache/kysely-write-cache.js";
import type { WriteCacheConfig } from "../src/cache/write-cache-types.js";
import { DocumentModelRegistry } from "../src/registry/implementation.js";
import type { IDocumentModelRegistry } from "../src/registry/interfaces.js";
import { createTestOperationStore } from "../test/factories.js";

const DOCUMENT_ID = "bench-doc-1";
const DOCUMENT_TYPE = "powerhouse/document-drive";
const SCOPE = "global";
const BRANCH = "main";

const databases: Array<{ destroy: () => Promise<void> }> = [];

afterEach(async () => {
  for (const db of databases) {
    await db.destroy();
  }
  databases.length = 0;
});

async function createDocumentInStore(
  store: any,
  documentId: string,
): Promise<void> {
  const initialState = driveDocumentModelModule.utils.createState();

  await store.apply(
    documentId,
    DOCUMENT_TYPE,
    "document",
    BRANCH,
    0,
    (txn: any) => {
      txn.addOperations({
        id: `${documentId}-op-doc-0`,
        index: 0,
        skip: 0,
        hash: `${documentId}-hash-doc-0`,
        timestampUtcMs: new Date().toISOString(),
        action: {
          id: `${documentId}-create`,
          type: "CREATE_DOCUMENT",
          scope: "document",
          timestampUtcMs: Date.now().toString(),
          input: {
            documentId,
            model: DOCUMENT_TYPE,
            version: "0.0.0",
          },
        },
      });

      txn.addOperations({
        id: `${documentId}-op-doc-1`,
        index: 1,
        skip: 0,
        hash: `${documentId}-hash-doc-1`,
        timestampUtcMs: new Date().toISOString(),
        action: {
          id: `${documentId}-upgrade`,
          type: "UPGRADE_DOCUMENT",
          scope: "document",
          timestampUtcMs: Date.now().toString(),
          input: {
            documentId,
            model: DOCUMENT_TYPE,
            fromVersion: "0.0.0",
            toVersion: "1.0.0",
            initialState,
          },
        },
      });
    },
  );
}

async function setupCacheWithData(
  operationCount: number,
  config: WriteCacheConfig = {
    maxDocuments: 100,
    ringBufferSize: 10,
    keyframeInterval: 10,
  },
): Promise<{
  cache: KyselyWriteCache;
  registry: IDocumentModelRegistry;
}> {
  const { db, store, keyframeStore } = await createTestOperationStore();
  databases.push(db);

  const registry = new DocumentModelRegistry();
  registry.registerModules(driveDocumentModelModule);

  const cache = new KyselyWriteCache(keyframeStore, store, registry, config);
  await cache.startup();

  await createDocumentInStore(store, DOCUMENT_ID);

  for (let i = 1; i <= operationCount; i++) {
    await store.apply(
      DOCUMENT_ID,
      DOCUMENT_TYPE,
      SCOPE,
      BRANCH,
      i - 1,
      (txn: any) => {
        txn.addOperations({
          id: `op-${i}`,
          index: i,
          skip: 0,
          hash: `hash-${i}`,
          timestampUtcMs: new Date().toISOString(),
          action: {
            id: `action-${i}`,
            type: i % 2 === 0 ? "ADD_FILE" : "ADD_FOLDER",
            scope: SCOPE,
            timestampUtcMs: Date.now().toString(),
            input:
              i % 2 === 0
                ? {
                    id: `file-${i}`,
                    name: `file-${i}.txt`,
                    documentType: "powerhouse/document-model",
                    parentFolder: null,
                  }
                : {
                    id: `folder-${i}`,
                    name: `Folder ${i}`,
                    parentFolder: null,
                  },
          },
        });
      },
    );
  }

  return { cache, registry };
}

async function setupCacheWithCachedDocument(
  operationCount: number,
  cachedRevision: number,
): Promise<KyselyWriteCache> {
  const { cache } = await setupCacheWithData(operationCount);

  await cache.getState(DOCUMENT_ID, SCOPE, BRANCH, cachedRevision);

  return cache;
}

describe("Write Cache Cold Miss Performance", () => {
  bench(
    "Cold miss rebuild (100 operations)",
    async () => {
      const { cache } = await setupCacheWithData(100);

      await cache.getState(DOCUMENT_ID, SCOPE, BRANCH, 100);
    },
    { time: 2000 },
  );

  bench(
    "Cold miss rebuild (1000 operations)",
    async () => {
      const { cache } = await setupCacheWithData(1000);

      await cache.getState(DOCUMENT_ID, SCOPE, BRANCH, 1000);
    },
    { time: 5000 },
  );

  bench(
    "Cold miss with keyframe optimization (100 ops, keyframe at 50)",
    async () => {
      const { cache } = await setupCacheWithData(100, {
        maxDocuments: 100,
        ringBufferSize: 10,
        keyframeInterval: 50,
      });

      const doc50 = await cache.getState(DOCUMENT_ID, SCOPE, BRANCH, 50);
      cache.putState(DOCUMENT_ID, SCOPE, BRANCH, 50, doc50);

      await new Promise((resolve) => setTimeout(resolve, 100));

      cache.clear();

      await cache.getState(DOCUMENT_ID, SCOPE, BRANCH, 100);
    },
    { time: 2000 },
  );
});

describe("Write Cache Hit Performance", () => {
  bench(
    "Cache hit (exact revision match)",
    async () => {
      const cache = await setupCacheWithCachedDocument(100, 50);

      await cache.getState(DOCUMENT_ID, SCOPE, BRANCH, 50);
    },
    { time: 1000 },
  );

  bench(
    "Cache hit (latest revision)",
    async () => {
      const cache = await setupCacheWithCachedDocument(100, 100);

      await cache.getState(DOCUMENT_ID, SCOPE, BRANCH);
    },
    { time: 1000 },
  );

  bench(
    "Cache hit with multiple revisions in ring buffer",
    async () => {
      const { cache } = await setupCacheWithData(100);

      for (let i = 91; i <= 100; i++) {
        const doc = await cache.getState(DOCUMENT_ID, SCOPE, BRANCH, i);
        cache.putState(DOCUMENT_ID, SCOPE, BRANCH, i, doc);
      }

      await cache.getState(DOCUMENT_ID, SCOPE, BRANCH, 95);
    },
    { time: 1000 },
  );
});

describe("Write Cache Warm Miss Performance", () => {
  bench(
    "Warm miss rebuild (10 incremental operations)",
    async () => {
      const cache = await setupCacheWithCachedDocument(100, 50);

      await cache.getState(DOCUMENT_ID, SCOPE, BRANCH, 60);
    },
    { time: 1000 },
  );

  bench(
    "Warm miss rebuild (50 incremental operations)",
    async () => {
      const cache = await setupCacheWithCachedDocument(200, 50);

      await cache.getState(DOCUMENT_ID, SCOPE, BRANCH, 100);
    },
    { time: 1000 },
  );

  bench(
    "Warm miss with nearby cached revision",
    async () => {
      const { cache } = await setupCacheWithData(100);

      await cache.getState(DOCUMENT_ID, SCOPE, BRANCH, 90);

      await cache.getState(DOCUMENT_ID, SCOPE, BRANCH, 95);
    },
    { time: 1000 },
  );
});

describe("Write Cache LRU Eviction Performance", () => {
  bench(
    "LRU eviction (filling cache to capacity)",
    async () => {
      const { db, store, keyframeStore } = await createTestOperationStore();
      databases.push(db);

      const registry = new DocumentModelRegistry();
      registry.registerModules(driveDocumentModelModule);

      const cache = new KyselyWriteCache(keyframeStore, store, registry, {
        maxDocuments: 10,
        ringBufferSize: 5,
        keyframeInterval: 10,
      });
      await cache.startup();

      for (let i = 1; i <= 15; i++) {
        const docId = `doc-${i}`;
        await createDocumentInStore(store, docId);

        await store.apply(
          docId,
          DOCUMENT_TYPE,
          SCOPE,
          BRANCH,
          0,
          (txn: any) => {
            txn.addOperations({
              id: `${docId}-op-1`,
              index: 1,
              skip: 0,
              hash: `${docId}-hash-1`,
              timestampUtcMs: new Date().toISOString(),
              action: {
                id: `${docId}-action-1`,
                type: "ADD_FOLDER",
                scope: SCOPE,
                timestampUtcMs: Date.now().toString(),
                input: {
                  id: `${docId}-folder-1`,
                  name: `Folder 1`,
                  parentFolder: null,
                },
              },
            });
          },
        );

        const doc = await cache.getState(docId, SCOPE, BRANCH, 1);
        cache.putState(docId, SCOPE, BRANCH, 1, doc);
      }
    },
    { time: 2000 },
  );

  bench(
    "LRU access pattern (updating access order)",
    async () => {
      const { db, store, keyframeStore } = await createTestOperationStore();
      databases.push(db);

      const registry = new DocumentModelRegistry();
      registry.registerModules(driveDocumentModelModule);

      const cache = new KyselyWriteCache(keyframeStore, store, registry, {
        maxDocuments: 5,
        ringBufferSize: 5,
        keyframeInterval: 10,
      });
      await cache.startup();

      for (let i = 1; i <= 5; i++) {
        const docId = `doc-${i}`;
        await createDocumentInStore(store, docId);

        await store.apply(
          docId,
          DOCUMENT_TYPE,
          SCOPE,
          BRANCH,
          0,
          (txn: any) => {
            txn.addOperations({
              id: `${docId}-op-1`,
              index: 1,
              skip: 0,
              hash: `${docId}-hash-1`,
              timestampUtcMs: new Date().toISOString(),
              action: {
                id: `${docId}-action-1`,
                type: "ADD_FOLDER",
                scope: SCOPE,
                timestampUtcMs: Date.now().toString(),
                input: {
                  id: `${docId}-folder-1`,
                  name: `Folder 1`,
                  parentFolder: null,
                },
              },
            });
          },
        );

        const doc = await cache.getState(docId, SCOPE, BRANCH, 1);
        cache.putState(docId, SCOPE, BRANCH, 1, doc);
      }

      for (let i = 1; i <= 5; i++) {
        await cache.getState(`doc-${i}`, SCOPE, BRANCH, 1);
      }
    },
    { time: 2000 },
  );
});

describe("Write Cache vs No-Cache Baseline", () => {
  bench(
    "No-cache baseline: manual rebuild (100 operations)",
    async () => {
      const { db, store } = await createTestOperationStore();
      databases.push(db);

      const registry = new DocumentModelRegistry();
      registry.registerModules(driveDocumentModelModule);

      await createDocumentInStore(store, DOCUMENT_ID);

      for (let i = 1; i <= 100; i++) {
        await store.apply(
          DOCUMENT_ID,
          DOCUMENT_TYPE,
          SCOPE,
          BRANCH,
          i - 1,
          (txn: any) => {
            txn.addOperations({
              id: `op-${i}`,
              index: i,
              skip: 0,
              hash: `hash-${i}`,
              timestampUtcMs: new Date().toISOString(),
              action: {
                id: `action-${i}`,
                type: i % 2 === 0 ? "ADD_FILE" : "ADD_FOLDER",
                scope: SCOPE,
                timestampUtcMs: Date.now().toString(),
                input:
                  i % 2 === 0
                    ? {
                        id: `file-${i}`,
                        name: `file-${i}.txt`,
                        documentType: "powerhouse/document-model",
                        parentFolder: null,
                      }
                    : {
                        id: `folder-${i}`,
                        name: `Folder ${i}`,
                        parentFolder: null,
                      },
              },
            });
          },
        );
      }

      const module = registry.getModule(DOCUMENT_TYPE);
      let document: PHDocument | undefined = undefined;

      const result = await store.getSince(
        DOCUMENT_ID,
        SCOPE,
        BRANCH,
        0,
        undefined,
        undefined,
      );

      for (const storedOp of result.items) {
        if (document === undefined) {
          document = module.utils.createDocument();
        }
        document = module.reducer(document, storedOp.action);
      }
    },
    { time: 2000 },
  );

  bench(
    "With cache: rebuild (100 operations)",
    async () => {
      const { cache } = await setupCacheWithData(100);

      await cache.getState(DOCUMENT_ID, SCOPE, BRANCH, 100);
    },
    { time: 2000 },
  );

  bench(
    "No-cache baseline: manual rebuild (1000 operations)",
    async () => {
      const { db, store } = await createTestOperationStore();
      databases.push(db);

      const registry = new DocumentModelRegistry();
      registry.registerModules(driveDocumentModelModule);

      await createDocumentInStore(store, DOCUMENT_ID);

      for (let i = 1; i <= 1000; i++) {
        await store.apply(
          DOCUMENT_ID,
          DOCUMENT_TYPE,
          SCOPE,
          BRANCH,
          i - 1,
          (txn: any) => {
            txn.addOperations({
              id: `op-${i}`,
              index: i,
              skip: 0,
              hash: `hash-${i}`,
              timestampUtcMs: new Date().toISOString(),
              action: {
                id: `action-${i}`,
                type: i % 2 === 0 ? "ADD_FILE" : "ADD_FOLDER",
                scope: SCOPE,
                timestampUtcMs: Date.now().toString(),
                input:
                  i % 2 === 0
                    ? {
                        id: `file-${i}`,
                        name: `file-${i}.txt`,
                        documentType: "powerhouse/document-model",
                        parentFolder: null,
                      }
                    : {
                        id: `folder-${i}`,
                        name: `Folder ${i}`,
                        parentFolder: null,
                      },
              },
            });
          },
        );
      }

      const module = registry.getModule(DOCUMENT_TYPE);
      let document: PHDocument | undefined = undefined;

      let cursor: string | undefined;
      do {
        const result = await store.getSince(
          DOCUMENT_ID,
          SCOPE,
          BRANCH,
          0,
          { limit: 100, cursor },
          undefined,
        );

        for (const storedOp of result.items) {
          if (document === undefined) {
            document = module.utils.createDocument();
          }
          document = module.reducer(document, storedOp.action);
        }

        cursor = result.nextCursor;
      } while (cursor);
    },
    { time: 5000 },
  );

  bench(
    "With cache: rebuild (1000 operations)",
    async () => {
      const { cache } = await setupCacheWithData(1000);

      await cache.getState(DOCUMENT_ID, SCOPE, BRANCH, 1000);
    },
    { time: 5000 },
  );
});

describe("Write Cache Keyframe Performance", () => {
  bench(
    "Keyframe persistence overhead (every 10th revision)",
    async () => {
      const { cache } = await setupCacheWithData(0, {
        maxDocuments: 100,
        ringBufferSize: 10,
        keyframeInterval: 10,
      });

      const baseDoc = driveDocumentModelModule.utils.createDocument();

      for (let i = 1; i <= 100; i++) {
        cache.putState(DOCUMENT_ID, SCOPE, BRANCH, i, baseDoc);
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    },
    { time: 1000 },
  );

  bench(
    "Without keyframe persistence (interval = 1000000)",
    async () => {
      const { cache } = await setupCacheWithData(0, {
        maxDocuments: 100,
        ringBufferSize: 10,
        keyframeInterval: 1000000,
      });

      const baseDoc = driveDocumentModelModule.utils.createDocument();

      for (let i = 1; i <= 100; i++) {
        cache.putState(DOCUMENT_ID, SCOPE, BRANCH, i, baseDoc);
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    },
    { time: 1000 },
  );
});
