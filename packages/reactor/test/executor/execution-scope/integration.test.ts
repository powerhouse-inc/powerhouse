import { driveDocumentModelModule } from "document-drive";
import { deriveOperationId, generateId } from "document-model/core";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CollectionMembershipCache } from "../../../src/cache/collection-membership-cache.js";
import { DocumentMetaCache } from "../../../src/cache/document-meta-cache.js";
import { KyselyOperationIndex } from "../../../src/cache/kysely-operation-index.js";
import { KyselyWriteCache } from "../../../src/cache/kysely-write-cache.js";
import { driveCollectionId } from "../../../src/cache/operation-index-types.js";
import type { WriteCacheConfig } from "../../../src/cache/write-cache-types.js";
import { KyselyExecutionScope } from "../../../src/executor/execution-scope.js";
import { DocumentModelRegistry } from "../../../src/registry/implementation.js";
import type { IDocumentModelRegistry } from "../../../src/registry/interfaces.js";
import type { KyselyKeyframeStore } from "../../../src/storage/kysely/keyframe-store.js";
import type { KyselyOperationStore } from "../../../src/storage/kysely/store.js";
import type { Database as DatabaseSchema } from "../../../src/storage/kysely/types.js";
import { createTestOperationStore } from "../../factories.js";

describe("KyselyExecutionScope Integration", () => {
  let db: Kysely<DatabaseSchema>;
  let operationStore: KyselyOperationStore;
  let keyframeStore: KyselyKeyframeStore;
  let writeCache: KyselyWriteCache;
  let operationIndex: KyselyOperationIndex;
  let documentMetaCache: DocumentMetaCache;
  let collectionMembershipCache: CollectionMembershipCache;
  let registry: IDocumentModelRegistry;
  let scope: KyselyExecutionScope;

  async function createDocumentWithCreateOperation(
    documentId: string,
    documentType: string,
    state: any,
  ): Promise<void> {
    const createActionId = generateId();
    const createOperation = {
      id: deriveOperationId(documentId, "document", "main", createActionId),
      index: 0,
      timestampUtcMs: new Date().toISOString(),
      hash: "",
      skip: 0,
      action: {
        id: createActionId,
        type: "CREATE_DOCUMENT",
        scope: "document",
        timestampUtcMs: new Date().toISOString(),
        input: {
          documentId,
          model: documentType,
        },
      },
    };

    const upgradeActionId = generateId();
    const upgradeOperation = {
      id: deriveOperationId(documentId, "document", "main", upgradeActionId),
      index: 1,
      timestampUtcMs: new Date().toISOString(),
      hash: "",
      skip: 0,
      action: {
        id: upgradeActionId,
        type: "UPGRADE_DOCUMENT",
        scope: "document",
        timestampUtcMs: new Date().toISOString(),
        input: {
          state,
        },
      },
    };

    await operationStore.apply(
      documentId,
      documentType,
      "document",
      "main",
      0,
      (txn) => {
        txn.addOperations(createOperation);
      },
    );

    await operationStore.apply(
      documentId,
      documentType,
      "document",
      "main",
      1,
      (txn) => {
        txn.addOperations(upgradeOperation);
      },
    );

    const indexTxn = operationIndex.start();
    indexTxn.write([
      {
        ...createOperation,
        documentId,
        documentType,
        branch: "main",
        scope: "document",
        sourceRemote: "",
      },
      {
        ...upgradeOperation,
        documentId,
        documentType,
        branch: "main",
        scope: "document",
        sourceRemote: "",
      },
    ]);

    if (documentType === "powerhouse/document-drive") {
      const collectionId = driveCollectionId("main", documentId);
      indexTxn.createCollection(collectionId);
      indexTxn.addToCollection(collectionId, documentId);
    }

    await operationIndex.commit(indexTxn);
  }

  beforeEach(async () => {
    registry = new DocumentModelRegistry();
    registry.registerModules(driveDocumentModelModule);

    const setup = await createTestOperationStore();
    db = setup.db;
    operationStore = setup.store;
    keyframeStore = setup.keyframeStore;

    const config: WriteCacheConfig = {
      maxDocuments: 10,
      ringBufferSize: 5,
      keyframeInterval: 10,
    };

    writeCache = new KyselyWriteCache(
      keyframeStore,
      operationStore,
      registry,
      config,
    );
    await writeCache.startup();

    operationIndex = new KyselyOperationIndex(db);

    documentMetaCache = new DocumentMetaCache(operationStore, {
      maxDocuments: 100,
    });
    await documentMetaCache.startup();

    collectionMembershipCache = new CollectionMembershipCache(operationIndex);

    scope = new KyselyExecutionScope(
      db,
      operationStore,
      operationIndex,
      keyframeStore,
      writeCache,
      documentMetaCache,
      collectionMembershipCache,
    );
  });

  afterEach(async () => {
    await writeCache.shutdown();
    await documentMetaCache.shutdown();
    try {
      await db.destroy();
    } catch {
      //
    }
  });

  describe("Transaction Rollback", () => {
    it("should roll back DB writes when callback throws", async () => {
      const document = driveDocumentModelModule.utils.createDocument();
      await createDocumentWithCreateOperation(
        document.header.id,
        document.header.documentType,
        document.state,
      );

      const addFolderActionId = generateId();
      const addFolderOp = {
        id: deriveOperationId(
          document.header.id,
          "global",
          "main",
          addFolderActionId,
        ),
        index: 0,
        timestampUtcMs: new Date().toISOString(),
        hash: "",
        skip: 0,
        action: {
          id: addFolderActionId,
          type: "ADD_FOLDER",
          scope: "global",
          timestampUtcMs: new Date().toISOString(),
          input: {
            id: "folder-1",
            name: "Test Folder",
            parentFolder: null,
          },
        },
      };

      await expect(
        scope.run(async (stores) => {
          await stores.operationStore.apply(
            document.header.id,
            document.header.documentType,
            "global",
            "main",
            0,
            (txn) => {
              txn.addOperations(addFolderOp);
            },
          );
          throw new Error("Simulated failure");
        }),
      ).rejects.toThrow("Simulated failure");

      const operations = await operationStore.getSince(
        document.header.id,
        "global",
        "main",
        -1,
      );
      expect(operations.results).toHaveLength(0);
    });
  });

  describe("Cache Miss Within Transaction", () => {
    it(
      "should handle write cache cold miss without deadlock",
      { timeout: 10000 },
      async () => {
        const document = driveDocumentModelModule.utils.createDocument();
        await createDocumentWithCreateOperation(
          document.header.id,
          document.header.documentType,
          document.state,
        );

        const result = await scope.run(async (stores) => {
          const doc = await stores.writeCache.getState(
            document.header.id,
            "global",
            "main",
          );
          return doc;
        });

        expect(result).toBeDefined();
        expect(result.header.documentType).toBe("powerhouse/document-drive");
      },
    );

    it(
      "should handle document meta cache cold miss without deadlock",
      { timeout: 10000 },
      async () => {
        const document = driveDocumentModelModule.utils.createDocument();
        await createDocumentWithCreateOperation(
          document.header.id,
          document.header.documentType,
          document.state,
        );

        const result = await scope.run(async (stores) => {
          const meta = await stores.documentMetaCache.getDocumentMeta(
            document.header.id,
            "main",
          );
          return meta;
        });

        expect(result).toBeDefined();
        expect(result.documentType).toBe("powerhouse/document-drive");
      },
    );
  });

  describe("Shared In-Memory State", () => {
    it("should share write cache streams between scoped and original", async () => {
      const document = driveDocumentModelModule.utils.createDocument();
      await createDocumentWithCreateOperation(
        document.header.id,
        document.header.documentType,
        document.state,
      );

      await scope.run(async (stores) => {
        const doc = await stores.writeCache.getState(
          document.header.id,
          "global",
          "main",
        );
        stores.writeCache.putState(
          document.header.id,
          "global",
          "main",
          0,
          doc,
        );
      });

      const stream = writeCache.getStream(document.header.id, "global", "main");
      expect(stream).toBeDefined();
    });

    it("should share document meta cache between scoped and original", async () => {
      const document = driveDocumentModelModule.utils.createDocument();
      await createDocumentWithCreateOperation(
        document.header.id,
        document.header.documentType,
        document.state,
      );

      await scope.run(async (stores) => {
        await stores.documentMetaCache.getDocumentMeta(
          document.header.id,
          "main",
        );
      });

      const meta = await documentMetaCache.getDocumentMeta(
        document.header.id,
        "main",
      );
      expect(meta.documentType).toBe("powerhouse/document-drive");
    });
  });

  describe("Scoped Store Identity", () => {
    it("should provide different store instances than the originals", async () => {
      const stores = await scope.run((s) => Promise.resolve(s));

      expect(stores.operationStore).not.toBe(operationStore);
      expect(stores.writeCache).not.toBe(writeCache);
      expect(stores.operationIndex).not.toBe(operationIndex);
      expect(stores.documentMetaCache).not.toBe(documentMetaCache);
      expect(stores.collectionMembershipCache).not.toBe(
        collectionMembershipCache,
      );
    });
  });
});
