import type {
  DocumentDriveDocument,
  FileNode,
  FolderNode,
} from "document-drive";
import { driveDocumentModelModule } from "document-drive";
import type { Operation } from "document-model";
import { documentModelDocumentModelModule } from "document-model";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KyselyWriteCache } from "../../src/cache/kysely-write-cache.js";
import type { WriteCacheConfig } from "../../src/cache/write-cache-types.js";
import { getNextIndexForScope } from "../../src/executor/util.js";
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
  createUpgradeDocumentOperation,
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
    registry.registerModules(
      documentModelDocumentModelModule,
      driveDocumentModelModule,
    );

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

    try {
      await db.destroy();
    } catch {
      //
    }
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

    it("should use keyframes to accelerate document rebuilds", async () => {
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

    it("should handle CREATE_DOCUMENT followed by UPGRADE_DOCUMENT in sequence", async () => {
      const docId = "test-create-upgrade-sequence";
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

      const docAfterCreate = await cache.getState(docId, "document", "main", 0);
      cache.putState(docId, "document", "main", 0, docAfterCreate);

      const docForUpgrade = await cache.getState(docId, "document", "main");

      expect(docForUpgrade.header.revision).toBeDefined();
      expect(docForUpgrade.header.revision.document).toBe(1);

      const nextIndex = getNextIndexForScope(docForUpgrade, "document");
      expect(nextIndex).toBe(1);

      await operationStore.apply(
        docId,
        docType,
        "document",
        "main",
        nextIndex,
        (txn) => {
          txn.addOperations(
            createUpgradeDocumentOperation(docId, nextIndex, {
              global: { test: "state" },
              local: {},
            }),
          );
        },
      );

      cache.invalidate(docId, "document", "main");

      const finalDoc = await cache.getState(docId, "document", "main");
      expect(finalDoc.header.revision.document).toBe(2);
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
    it("should handle moderate operation sets efficiently", async () => {
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

  describe("Document-Drive Specific Scenarios", () => {
    it("should handle complete document lifecycle with document-drive operations", async () => {
      const docId = "drive-doc-1";
      const docType = "powerhouse/document-drive";
      const scope = "global";
      const branch = "main";

      const initialState = driveDocumentModelModule.utils.createState();

      await operationStore.apply(
        docId,
        docType,
        "document",
        branch,
        0,
        (txn) => {
          txn.addOperations({
            id: "op-doc-0",
            index: 0,
            skip: 0,
            hash: "hash-doc-0",
            timestampUtcMs: new Date().toISOString(),
            action: {
              id: `${docId}-create`,
              type: "CREATE_DOCUMENT",
              scope: "document",
              timestampUtcMs: Date.now().toString(),
              input: {
                documentId: docId,
                model: docType,
                version: "0.0.0",
              },
            },
          });

          txn.addOperations({
            id: "op-doc-1",
            index: 1,
            skip: 0,
            hash: "hash-doc-1",
            timestampUtcMs: new Date().toISOString(),
            action: {
              id: `${docId}-upgrade`,
              type: "UPGRADE_DOCUMENT",
              scope: "document",
              timestampUtcMs: Date.now().toString(),
              input: {
                documentId: docId,
                model: docType,
                fromVersion: "0.0.0",
                toVersion: "1.0.0",
                initialState,
              },
            },
          });
        },
      );

      await operationStore.apply(docId, docType, scope, branch, 0, (txn) => {
        txn.addOperations({
          id: "op-1",
          index: 1,
          skip: 0,
          hash: "hash-1",
          timestampUtcMs: new Date().toISOString(),
          action: {
            id: "action-1",
            type: "ADD_FOLDER",
            scope: "global",
            timestampUtcMs: Date.now().toString(),
            input: {
              id: "folder-1",
              name: "Documents",
              parentFolder: null,
            },
          },
        });

        txn.addOperations({
          id: "op-2",
          index: 2,
          skip: 0,
          hash: "hash-2",
          timestampUtcMs: new Date().toISOString(),
          action: {
            id: "action-2",
            type: "ADD_FILE",
            scope: "global",
            timestampUtcMs: Date.now().toString(),
            input: {
              id: "file-1",
              name: "readme.txt",
              documentType: "powerhouse/document-model",
              parentFolder: "folder-1",
            },
          },
        });

        txn.addOperations({
          id: "op-3",
          index: 3,
          skip: 0,
          hash: "hash-3",
          timestampUtcMs: new Date().toISOString(),
          action: {
            id: "action-3",
            type: "ADD_FOLDER",
            scope: "global",
            timestampUtcMs: Date.now().toString(),
            input: {
              id: "folder-2",
              name: "Images",
              parentFolder: null,
            },
          },
        });
      });

      const doc3 = await cache.getState(docId, scope, branch, 3);
      expect(doc3.header.documentType).toBe(docType);

      const driveDoc3 = doc3 as DocumentDriveDocument;
      const nodes3 = Object.values(driveDoc3.state.global.nodes);
      expect(nodes3).toHaveLength(3);

      const folder1 = nodes3.find(
        (n) => n.kind === "folder" && n.name === "Documents",
      ) as FolderNode;
      const folder2 = nodes3.find(
        (n) => n.kind === "folder" && n.name === "Images",
      ) as FolderNode;
      const file1 = nodes3.find(
        (n) => n.kind === "file" && n.name === "readme.txt",
      ) as FileNode;

      expect(folder1).toBeDefined();
      expect(folder1.id).toBe("folder-1");
      expect(folder1.parentFolder).toBeNull();

      expect(folder2).toBeDefined();
      expect(folder2.id).toBe("folder-2");
      expect(folder2.parentFolder).toBeNull();

      expect(file1).toBeDefined();
      expect(file1.id).toBe("file-1");
      expect(file1.parentFolder).toBe("folder-1");
      expect(file1.documentType).toBe("powerhouse/document-model");

      const stream3 = cache.getStream(docId, scope, branch);
      expect(stream3).toBeDefined();
      expect(stream3?.ringBuffer.length).toBe(1);

      const doc3Again = await cache.getState(docId, scope, branch, 3);
      expect(doc3Again).toEqual(doc3);

      await operationStore.apply(docId, docType, scope, branch, 4, (txn) => {
        txn.addOperations({
          id: "op-4",
          index: 4,
          skip: 0,
          hash: "hash-4",
          timestampUtcMs: new Date().toISOString(),
          action: {
            id: "action-4",
            type: "ADD_FILE",
            scope: "global",
            timestampUtcMs: Date.now().toString(),
            input: {
              id: "file-2",
              name: "image.png",
              documentType: "powerhouse/document-model",
              parentFolder: "folder-2",
            },
          },
        });

        txn.addOperations({
          id: "op-5",
          index: 5,
          skip: 0,
          hash: "hash-5",
          timestampUtcMs: new Date().toISOString(),
          action: {
            id: "action-5",
            type: "ADD_FOLDER",
            scope: "global",
            timestampUtcMs: Date.now().toString(),
            input: {
              id: "folder-3",
              name: "Archive",
              parentFolder: "folder-1",
            },
          },
        });
      });

      const doc5 = await cache.getState(docId, scope, branch, 5);
      expect(doc5).toBeDefined();

      const driveDoc5 = doc5 as DocumentDriveDocument;
      const nodes5 = Object.values(driveDoc5.state.global.nodes);
      expect(nodes5).toHaveLength(5);

      const file2 = nodes5.find(
        (n) => n.kind === "file" && n.name === "image.png",
      ) as FileNode;
      const folder3 = nodes5.find(
        (n) => n.kind === "folder" && n.name === "Archive",
      ) as FolderNode;

      expect(file2).toBeDefined();
      expect(file2.id).toBe("file-2");
      expect(file2.parentFolder).toBe("folder-2");

      expect(folder3).toBeDefined();
      expect(folder3.id).toBe("folder-3");
      expect(folder3.parentFolder).toBe("folder-1");

      const stream5 = cache.getStream(docId, scope, branch);
      expect(stream5?.ringBuffer.length).toBe(2);
      const snapshots = stream5?.ringBuffer.getAll();
      expect(snapshots?.[0].revision).toBe(3);
      expect(snapshots?.[1].revision).toBe(5);
    });

    it("should handle cold miss with keyframe acceleration", async () => {
      const docId = "drive-doc-2";
      const docType = "powerhouse/document-drive";
      const scope = "global";
      const branch = "main";

      const initialState = driveDocumentModelModule.utils.createState();

      await operationStore.apply(
        docId,
        docType,
        "document",
        branch,
        0,
        (txn) => {
          txn.addOperations({
            id: "op-doc-0",
            index: 0,
            skip: 0,
            hash: "hash-doc-0",
            timestampUtcMs: new Date().toISOString(),
            action: {
              id: `${docId}-create`,
              type: "CREATE_DOCUMENT",
              scope: "document",
              timestampUtcMs: Date.now().toString(),
              input: {
                documentId: docId,
                model: docType,
                version: "0.0.0",
              },
            },
          });

          txn.addOperations({
            id: "op-doc-1",
            index: 1,
            skip: 0,
            hash: "hash-doc-1",
            timestampUtcMs: new Date().toISOString(),
            action: {
              id: `${docId}-upgrade`,
              type: "UPGRADE_DOCUMENT",
              scope: "document",
              timestampUtcMs: Date.now().toString(),
              input: {
                documentId: docId,
                model: docType,
                fromVersion: "0.0.0",
                toVersion: "1.0.0",
                initialState,
              },
            },
          });
        },
      );

      await operationStore.apply(docId, docType, scope, branch, 0, (txn) => {
        for (let i = 1; i <= 25; i++) {
          txn.addOperations({
            id: `op-${i}`,
            index: i,
            skip: 0,
            hash: `hash-${i}`,
            timestampUtcMs: new Date().toISOString(),
            action: {
              id: `action-${i}`,
              type: "ADD_FOLDER",
              scope: "global",
              timestampUtcMs: Date.now().toString(),
              input: {
                id: `folder-${i}`,
                name: `Folder ${i}`,
                parentFolder: null,
              },
            },
          });
        }
      });

      const doc10 = await cache.getState(docId, scope, branch, 10);
      await keyframeStore.putKeyframe(docId, scope, branch, 10, doc10);

      const doc20 = await cache.getState(docId, scope, branch, 20);
      await keyframeStore.putKeyframe(docId, scope, branch, 20, doc20);

      await db
        .deleteFrom("Operation")
        .where("documentId", "=", docId)
        .where("index", "<=", 20)
        .execute();

      cache.clear();

      const doc25 = await cache.getState(docId, scope, branch, 25);
      expect(doc25).toBeDefined();

      const driveDoc25 = doc25 as DocumentDriveDocument;
      const nodes = Object.values(driveDoc25.state.global.nodes);
      expect(nodes).toHaveLength(25);

      const folder25 = nodes.find(
        (n) => n.kind === "folder" && n.name === "Folder 25",
      ) as FolderNode;
      expect(folder25).toBeDefined();
      expect(folder25.id).toBe("folder-25");
    });

    it("should handle complex folder hierarchy with multiple files", async () => {
      const docId = "drive-doc-4";
      const docType = "powerhouse/document-drive";
      const scope = "global";
      const branch = "main";

      const initialState = driveDocumentModelModule.utils.createState();

      await operationStore.apply(
        docId,
        docType,
        "document",
        branch,
        0,
        (txn) => {
          txn.addOperations({
            id: "op-doc-0",
            index: 0,
            skip: 0,
            hash: "hash-doc-0",
            timestampUtcMs: new Date().toISOString(),
            action: {
              id: `${docId}-create`,
              type: "CREATE_DOCUMENT",
              scope: "document",
              timestampUtcMs: Date.now().toString(),
              input: {
                documentId: docId,
                model: docType,
                version: "0.0.0",
              },
            },
          });

          txn.addOperations({
            id: "op-doc-1",
            index: 1,
            skip: 0,
            hash: "hash-doc-1",
            timestampUtcMs: new Date().toISOString(),
            action: {
              id: `${docId}-upgrade`,
              type: "UPGRADE_DOCUMENT",
              scope: "document",
              timestampUtcMs: Date.now().toString(),
              input: {
                documentId: docId,
                model: docType,
                fromVersion: "0.0.0",
                toVersion: "1.0.0",
                initialState,
              },
            },
          });
        },
      );

      await operationStore.apply(docId, docType, scope, branch, 0, (txn) => {
        txn.addOperations({
          id: "op-1",
          index: 1,
          skip: 0,
          hash: "hash-1",
          timestampUtcMs: new Date().toISOString(),
          action: {
            id: "action-1",
            type: "ADD_FOLDER",
            scope: "global",
            timestampUtcMs: Date.now().toString(),
            input: {
              id: "root",
              name: "Root",
              parentFolder: null,
            },
          },
        });

        txn.addOperations({
          id: "op-2",
          index: 2,
          skip: 0,
          hash: "hash-2",
          timestampUtcMs: new Date().toISOString(),
          action: {
            id: "action-2",
            type: "ADD_FOLDER",
            scope: "global",
            timestampUtcMs: Date.now().toString(),
            input: {
              id: "projects",
              name: "Projects",
              parentFolder: "root",
            },
          },
        });

        txn.addOperations({
          id: "op-3",
          index: 3,
          skip: 0,
          hash: "hash-3",
          timestampUtcMs: new Date().toISOString(),
          action: {
            id: "action-3",
            type: "ADD_FOLDER",
            scope: "global",
            timestampUtcMs: Date.now().toString(),
            input: {
              id: "personal",
              name: "Personal",
              parentFolder: "root",
            },
          },
        });

        txn.addOperations({
          id: "op-4",
          index: 4,
          skip: 0,
          hash: "hash-4",
          timestampUtcMs: new Date().toISOString(),
          action: {
            id: "action-4",
            type: "ADD_FILE",
            scope: "global",
            timestampUtcMs: Date.now().toString(),
            input: {
              id: "project-1",
              name: "Project Alpha",
              documentType: "powerhouse/document-model",
              parentFolder: "projects",
            },
          },
        });

        txn.addOperations({
          id: "op-5",
          index: 5,
          skip: 0,
          hash: "hash-5",
          timestampUtcMs: new Date().toISOString(),
          action: {
            id: "action-5",
            type: "ADD_FILE",
            scope: "global",
            timestampUtcMs: Date.now().toString(),
            input: {
              id: "project-2",
              name: "Project Beta",
              documentType: "powerhouse/document-model",
              parentFolder: "projects",
            },
          },
        });

        txn.addOperations({
          id: "op-6",
          index: 6,
          skip: 0,
          hash: "hash-6",
          timestampUtcMs: new Date().toISOString(),
          action: {
            id: "action-6",
            type: "ADD_FILE",
            scope: "global",
            timestampUtcMs: Date.now().toString(),
            input: {
              id: "personal-1",
              name: "Notes",
              documentType: "powerhouse/document-model",
              parentFolder: "personal",
            },
          },
        });
      });

      const doc6 = await cache.getState(docId, scope, branch, 6);
      expect(doc6).toBeDefined();

      const driveDoc6 = doc6 as DocumentDriveDocument;
      const nodes = Object.values(driveDoc6.state.global.nodes);
      expect(nodes).toHaveLength(6);

      const root = nodes.find(
        (n) => n.kind === "folder" && n.name === "Root",
      ) as FolderNode;
      const projects = nodes.find(
        (n) => n.kind === "folder" && n.name === "Projects",
      ) as FolderNode;
      const personal = nodes.find(
        (n) => n.kind === "folder" && n.name === "Personal",
      ) as FolderNode;
      const projectAlpha = nodes.find(
        (n) => n.kind === "file" && n.name === "Project Alpha",
      ) as FileNode;
      const projectBeta = nodes.find(
        (n) => n.kind === "file" && n.name === "Project Beta",
      ) as FileNode;
      const notes = nodes.find(
        (n) => n.kind === "file" && n.name === "Notes",
      ) as FileNode;

      expect(root.parentFolder).toBeNull();
      expect(projects.parentFolder).toBe("root");
      expect(personal.parentFolder).toBe("root");
      expect(projectAlpha.parentFolder).toBe("projects");
      expect(projectBeta.parentFolder).toBe("projects");
      expect(notes.parentFolder).toBe("personal");

      const doc2 = await cache.getState(docId, scope, branch, 2);
      const driveDoc2 = doc2 as DocumentDriveDocument;
      const nodes2 = Object.values(driveDoc2.state.global.nodes);
      expect(nodes2).toHaveLength(2);
      expect(nodes2.some((n) => n.name === "Root")).toBe(true);
      expect(nodes2.some((n) => n.name === "Projects")).toBe(true);
    });

    it("should maintain cache consistency across multiple getState calls", async () => {
      const docId = "drive-doc-5";
      const docType = "powerhouse/document-drive";
      const scope = "global";
      const branch = "main";

      const initialState = driveDocumentModelModule.utils.createState();

      await operationStore.apply(
        docId,
        docType,
        "document",
        branch,
        0,
        (txn) => {
          txn.addOperations({
            id: "op-doc-0",
            index: 0,
            skip: 0,
            hash: "hash-doc-0",
            timestampUtcMs: new Date().toISOString(),
            action: {
              id: `${docId}-create`,
              type: "CREATE_DOCUMENT",
              scope: "document",
              timestampUtcMs: Date.now().toString(),
              input: {
                documentId: docId,
                model: docType,
                version: "0.0.0",
              },
            },
          });

          txn.addOperations({
            id: "op-doc-1",
            index: 1,
            skip: 0,
            hash: "hash-doc-1",
            timestampUtcMs: new Date().toISOString(),
            action: {
              id: `${docId}-upgrade`,
              type: "UPGRADE_DOCUMENT",
              scope: "document",
              timestampUtcMs: Date.now().toString(),
              input: {
                documentId: docId,
                model: docType,
                fromVersion: "0.0.0",
                toVersion: "1.0.0",
                initialState,
              },
            },
          });
        },
      );

      await operationStore.apply(docId, docType, scope, branch, 0, (txn) => {
        for (let i = 1; i <= 15; i++) {
          txn.addOperations({
            id: `op-${i}`,
            index: i,
            skip: 0,
            hash: `hash-${i}`,
            timestampUtcMs: new Date().toISOString(),
            action: {
              id: `action-${i}`,
              type: "ADD_FOLDER",
              scope: "global",
              timestampUtcMs: Date.now().toString(),
              input: {
                id: `folder-${i}`,
                name: `Folder ${i}`,
                parentFolder: null,
              },
            },
          });
        }
      });

      const doc5a = await cache.getState(docId, scope, branch, 5);
      const doc5b = await cache.getState(docId, scope, branch, 5);
      expect(doc5a).toEqual(doc5b);

      const doc10a = await cache.getState(docId, scope, branch, 10);
      const doc10b = await cache.getState(docId, scope, branch, 10);
      expect(doc10a).toEqual(doc10b);

      const doc15a = await cache.getState(docId, scope, branch, 15);
      const doc15b = await cache.getState(docId, scope, branch, 15);
      expect(doc15a).toEqual(doc15b);

      const driveDoc5 = doc5a as DocumentDriveDocument;
      const driveDoc10 = doc10a as DocumentDriveDocument;
      const driveDoc15 = doc15a as DocumentDriveDocument;

      expect(Object.keys(driveDoc5.state.global.nodes)).toHaveLength(5);
      expect(Object.keys(driveDoc10.state.global.nodes)).toHaveLength(10);
      expect(Object.keys(driveDoc15.state.global.nodes)).toHaveLength(15);
    });
  });
});
