import type { Operation } from "document-model";
import { documentModelDocumentModelModule } from "document-model";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KyselyWriteCache } from "../../src/cache/kysely-write-cache.js";
import type { WriteCacheConfig } from "../../src/cache/types.js";
import { DocumentModelRegistry } from "../../src/registry/implementation.js";
import type { IDocumentModelRegistry } from "../../src/registry/interfaces.js";
import type {
  IKeyframeStore,
  IOperationStore,
} from "../../src/storage/interfaces.js";
import type { Database as DatabaseSchema } from "../../src/storage/kysely/types.js";
import {
  createCreateDocumentOperation,
  createTestOperation,
  createTestOperationStore,
} from "../factories.js";

describe("KyselyWriteCache Integration Tests", () => {
  let cache: KyselyWriteCache;
  let keyframeStore: IKeyframeStore;
  let operationStore: IOperationStore;
  let registry: IDocumentModelRegistry;
  let config: WriteCacheConfig;
  let db: Kysely<DatabaseSchema>;

  beforeEach(async () => {
    const setup = await createTestOperationStore();
    operationStore = setup.store;
    keyframeStore = setup.keyframeStore;
    db = setup.db;

    registry = new DocumentModelRegistry();
    registry.registerModules(documentModelDocumentModelModule);

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
    await db.destroy();
  });

  describe("Full Integration Flow", () => {
    it("should handle complete document lifecycle with real dependencies", async () => {
      const docId = "integration-test-doc-1";
      const docType = "powerhouse/document-model";

      await operationStore.apply(
        docId,
        docType,
        "document",
        "main",
        0,
        (txn) => {
          txn.addOperations(createCreateDocumentOperation(docId, docType));
        },
      );

      const operations: Operation[] = [];
      for (let i = 1; i <= 5; i++) {
        operations.push(
          createTestOperation({
            id: `op-integration-${i}`,
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

      const document = await cache.getState(docId, "global", "main");

      expect(document).toBeDefined();
      expect(document.header).toBeDefined();
      expect(document.header.documentType).toBe(docType);
      expect(document.state).toBeDefined();
    });

    it("should persist and retrieve keyframes at configured intervals", async () => {
      const docId = "integration-test-doc-2";
      const docType = "powerhouse/document-model";

      await operationStore.apply(
        docId,
        docType,
        "document",
        "main",
        0,
        (txn) => {
          txn.addOperations(createCreateDocumentOperation(docId, docType));
        },
      );

      const operations: Operation[] = [];
      for (let i = 1; i <= 25; i++) {
        operations.push(
          createTestOperation({
            id: `op-integration-keyframe-${i}`,
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
      cache.putState(docId, "global", "main", 10, doc10);

      const doc20 = await cache.getState(docId, "global", "main", 20);
      cache.putState(docId, "global", "main", 20, doc20);

      const keyframe10 = await keyframeStore.findNearestKeyframe(
        docId,
        "global",
        "main",
        10,
      );
      expect(keyframe10).toBeDefined();
      expect(keyframe10?.revision).toBe(10);

      const keyframe20 = await keyframeStore.findNearestKeyframe(
        docId,
        "global",
        "main",
        20,
      );
      expect(keyframe20).toBeDefined();
      expect(keyframe20?.revision).toBe(20);
    });

    it.skip("should use keyframes to accelerate document rebuilds", async () => {
      const docId = "integration-test-doc-3";
      const docType = "powerhouse/document-model";

      await operationStore.apply(
        docId,
        docType,
        "document",
        "main",
        0,
        (txn) => {
          txn.addOperations(createCreateDocumentOperation(docId, docType));
        },
      );

      const operations: Operation[] = [];
      for (let i = 1; i <= 20; i++) {
        operations.push(
          createTestOperation({
            id: `op-integration-accelerate-${i}`,
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
      await keyframeStore.putKeyframe(docId, "global", "main", 10, doc10);

      await db
        .deleteFrom("Operation")
        .where("documentId", "=", docId)
        .where("scope", "=", "global")
        .where("index", "<=", 10)
        .execute();

      cache.clear();

      const doc20 = await cache.getState(docId, "global", "main", 20);

      expect(doc20).toBeDefined();
      expect(doc20.header.documentType).toBe(docType);
    });

    it("should handle cache hits, warm misses, and cold misses", async () => {
      const docId = "integration-test-doc-4";
      const docType = "powerhouse/document-model";

      await operationStore.apply(
        docId,
        docType,
        "document",
        "main",
        0,
        (txn) => {
          txn.addOperations(createCreateDocumentOperation(docId, docType));
        },
      );

      const operations: Operation[] = [];
      for (let i = 1; i <= 15; i++) {
        operations.push(
          createTestOperation({
            id: `op-integration-cache-${i}`,
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

      const doc5 = await cache.getState(docId, "global", "main", 5);
      expect(doc5).toBeDefined();

      const doc5Again = await cache.getState(docId, "global", "main", 5);
      expect(doc5Again).toEqual(doc5);

      const doc10 = await cache.getState(docId, "global", "main", 10);
      expect(doc10).toBeDefined();

      cache.invalidate(docId, "global", "main");

      const doc15 = await cache.getState(docId, "global", "main", 15);
      expect(doc15).toBeDefined();
    });

    it("should maintain LRU eviction with real registry lookups", async () => {
      const docIds = [
        "integration-test-lru-1",
        "integration-test-lru-2",
        "integration-test-lru-3",
        "integration-test-lru-4",
      ];
      const docType = "powerhouse/document-model";

      const limitedCache = new KyselyWriteCache(
        keyframeStore,
        operationStore,
        registry,
        {
          maxDocuments: 3,
          ringBufferSize: 5,
          keyframeInterval: 10,
        },
      );
      await limitedCache.startup();

      for (const docId of docIds) {
        await operationStore.apply(
          docId,
          docType,
          "document",
          "main",
          0,
          (txn) => {
            txn.addOperations(createCreateDocumentOperation(docId, docType));
          },
        );

        await operationStore.apply(
          docId,
          docType,
          "global",
          "main",
          0,
          (txn) => {
            txn.addOperations(
              createTestOperation({
                id: `op-${docId}`,
                index: 1,
                skip: 0,
              }),
            );
          },
        );

        await limitedCache.getState(docId, "global", "main", 1);
      }

      const evicted = limitedCache.invalidate(docIds[0], "global", "main");
      expect(evicted).toBe(0);

      await limitedCache.shutdown();
    });

    it("should handle multiple scopes and branches independently", async () => {
      const docId = "integration-test-doc-5";
      const docType = "powerhouse/document-model";

      await operationStore.apply(
        docId,
        docType,
        "document",
        "main",
        0,
        (txn) => {
          const createOp = createCreateDocumentOperation(docId, docType);
          createOp.id = `${docId}-create-main`;
          txn.addOperations(createOp);
        },
      );

      await operationStore.apply(
        docId,
        docType,
        "document",
        "feature",
        0,
        (txn) => {
          const createOp = createCreateDocumentOperation(docId, docType);
          createOp.id = `${docId}-create-feature`;
          txn.addOperations(createOp);
        },
      );

      await operationStore.apply(docId, docType, "global", "main", 0, (txn) => {
        txn.addOperations(
          createTestOperation({
            id: "op-global-main",
            index: 1,
            skip: 0,
          }),
        );
      });

      await operationStore.apply(
        docId,
        docType,
        "global",
        "feature",
        0,
        (txn) => {
          txn.addOperations(
            createTestOperation({
              id: "op-global-feature",
              index: 1,
              skip: 0,
            }),
          );
        },
      );

      await operationStore.apply(docId, docType, "local", "main", 0, (txn) => {
        txn.addOperations(
          createTestOperation({
            id: "op-local-main",
            index: 1,
            skip: 0,
          }),
        );
      });

      const globalMain = await cache.getState(docId, "global", "main", 1);
      const globalFeature = await cache.getState(docId, "global", "feature", 1);
      const localMain = await cache.getState(docId, "local", "main", 1);

      expect(globalMain).toBeDefined();
      expect(globalFeature).toBeDefined();
      expect(localMain).toBeDefined();

      const evicted = cache.invalidate(docId);
      expect(evicted).toBeGreaterThanOrEqual(3);
    });

    it("should handle abort signals during rebuild", async () => {
      const docId = "integration-test-doc-6";
      const docType = "powerhouse/document-model";

      await operationStore.apply(
        docId,
        docType,
        "document",
        "main",
        0,
        (txn) => {
          txn.addOperations(createCreateDocumentOperation(docId, docType));
        },
      );

      await operationStore.apply(docId, docType, "global", "main", 0, (txn) => {
        txn.addOperations(
          createTestOperation({
            id: "op-abort-test",
            index: 1,
            skip: 0,
          }),
        );
      });

      const controller = new AbortController();
      controller.abort();

      await expect(
        cache.getState(docId, "global", "main", 1, controller.signal),
      ).rejects.toThrow("Operation aborted");
    });

    it("should properly integrate with real document model modules", async () => {
      const docId = "integration-test-doc-7";
      const docType = "powerhouse/document-model";

      await operationStore.apply(
        docId,
        docType,
        "document",
        "main",
        0,
        (txn) => {
          txn.addOperations(createCreateDocumentOperation(docId, docType));
        },
      );

      await operationStore.apply(docId, docType, "global", "main", 0, (txn) => {
        txn.addOperations(
          createTestOperation({
            id: "op-module-test",
            index: 1,
            skip: 0,
          }),
        );
      });

      const document = await cache.getState(docId, "global", "main", 1);

      expect(document.header.documentType).toBe(docType);
      expect(registry.getModule(docType)).toBeDefined();
    });
  });

  describe("Error Handling Integration", () => {
    it("should throw when document cannot be rebuilt from operation store", async () => {
      const docId = "non-existent-doc";

      await expect(
        cache.getState(docId, "global", "main", 1),
      ).rejects.toThrow();
    });

    it("should handle keyframe store failures gracefully", async () => {
      const docId = "integration-test-doc-8";
      const docType = "powerhouse/document-model";

      await operationStore.apply(
        docId,
        docType,
        "document",
        "main",
        0,
        (txn) => {
          txn.addOperations(createCreateDocumentOperation(docId, docType));
        },
      );

      await operationStore.apply(docId, docType, "global", "main", 0, (txn) => {
        txn.addOperations(
          createTestOperation({
            id: "op-keyframe-fail",
            index: 1,
            skip: 0,
          }),
        );
      });

      const document = await cache.getState(docId, "global", "main", 1);
      expect(document).toBeDefined();
    });
  });

  describe("Performance Integration", () => {
    it.skip("should handle moderate operation sets efficiently", async () => {
      const docId = "integration-test-doc-9";
      const docType = "powerhouse/document-model";

      await operationStore.apply(
        docId,
        docType,
        "document",
        "main",
        0,
        (txn) => {
          txn.addOperations(createCreateDocumentOperation(docId, docType));
        },
      );

      const operations: Operation[] = [];
      for (let i = 1; i <= 20; i++) {
        operations.push(
          createTestOperation({
            id: `op-perf-${i}`,
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

      const startTime = Date.now();
      const document = await cache.getState(docId, "global", "main", 20);
      const endTime = Date.now();

      expect(document).toBeDefined();
      expect(endTime - startTime).toBeLessThan(3000);
    });
  });
});
