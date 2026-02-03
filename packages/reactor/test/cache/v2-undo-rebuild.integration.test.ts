import type { DocumentModelDocument } from "document-model";
import {
  deriveOperationId,
  documentModelDocumentModelModule,
  generateId,
} from "document-model";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CollectionMembershipCache } from "../../src/cache/collection-membership-cache.js";
import type { IDocumentMetaCache } from "../../src/cache/document-meta-cache-types.js";
import { DocumentMetaCache } from "../../src/cache/document-meta-cache.js";
import { KyselyOperationIndex } from "../../src/cache/kysely-operation-index.js";
import { KyselyWriteCache } from "../../src/cache/kysely-write-cache.js";
import type { IOperationIndex } from "../../src/cache/operation-index-types.js";
import type { WriteCacheConfig } from "../../src/cache/write-cache-types.js";
import { SimpleJobExecutor } from "../../src/executor/simple-job-executor.js";
import type { Job } from "../../src/queue/types.js";
import { DocumentModelRegistry } from "../../src/registry/implementation.js";
import type { IDocumentModelRegistry } from "../../src/registry/interfaces.js";
import type {
  IKeyframeStore,
  IOperationStore,
} from "../../src/storage/interfaces.js";
import type { Database as DatabaseSchema } from "../../src/storage/kysely/types.js";
import {
  createMockLogger,
  createTestEventBus,
  createTestOperationStore,
} from "../factories.js";

/**
 * Integration tests for v2 UNDO behavior during cache rebuild.
 *
 * These tests use real document models, real executor, and real actions to
 * verify that NOOP operations are correctly handled during cache
 * rebuild in protocol v2.
 */
describe("V2 UNDO Cache Rebuild Integration Tests", () => {
  let executor: SimpleJobExecutor;
  let registry: IDocumentModelRegistry;
  let db: Kysely<DatabaseSchema>;
  let operationStore: IOperationStore;
  let keyframeStore: IKeyframeStore;
  let writeCache: KyselyWriteCache;
  let operationIndex: IOperationIndex;
  let documentMetaCache: IDocumentMetaCache;

  async function createDocumentWithCreateOperation(
    documentId: string,
    documentType: string,
    state: DocumentModelDocument["state"],
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
          protocolVersions: { "base-reducer": 2 },
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
          documentId,
          fromVersion: 0,
          toVersion: 1,
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
      },
      {
        ...upgradeOperation,
        documentId,
        documentType,
        branch: "main",
        scope: "document",
      },
    ]);
    await operationIndex.commit(indexTxn);
  }

  beforeEach(async () => {
    registry = new DocumentModelRegistry();
    registry.registerModules(documentModelDocumentModelModule);

    const setup = await createTestOperationStore();
    db = setup.db;
    operationStore = setup.store;
    keyframeStore = setup.keyframeStore;

    const config: WriteCacheConfig = {
      maxDocuments: 10,
      ringBufferSize: 5,
      keyframeInterval: 100,
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

    const collectionMembershipCache = new CollectionMembershipCache(
      operationIndex,
    );

    const eventBus = createTestEventBus();
    executor = new SimpleJobExecutor(
      createMockLogger(),
      registry,
      operationStore,
      eventBus,
      writeCache,
      operationIndex,
      documentMetaCache,
      collectionMembershipCache,
      {},
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

  describe("Single UNDO rebuild", () => {
    it("should correctly rebuild document state when a single UNDO (NOOP with skip=1) exists", async () => {
      const document = documentModelDocumentModelModule.utils.createDocument();
      await createDocumentWithCreateOperation(
        document.header.id,
        document.header.documentType,
        document.state,
      );

      const setModelNameJob: Job = {
        id: "job-set-name",
        kind: "mutation",
        documentId: document.header.id,
        scope: "global",
        branch: "main",
        actions: [
          {
            id: generateId(),
            type: "SET_MODEL_NAME",
            scope: "global",
            timestampUtcMs: new Date().toISOString(),
            input: { name: "Test Model Name" },
          },
        ],
        operations: [],
        createdAt: new Date().toISOString(),
        queueHint: [],
        errorHistory: [],
      };

      const setNameResult = await executor.executeJob(setModelNameJob);
      expect(setNameResult.success).toBe(true);

      const docAfterSetName = (await writeCache.getState(
        document.header.id,
        "global",
        "main",
      )) as DocumentModelDocument;
      expect(docAfterSetName.state.global.name).toBe("Test Model Name");

      const undoJob: Job = {
        id: "job-undo",
        kind: "mutation",
        documentId: document.header.id,
        scope: "global",
        branch: "main",
        actions: [
          {
            id: generateId(),
            type: "UNDO",
            scope: "global",
            timestampUtcMs: new Date().toISOString(),
            input: {},
          },
        ],
        operations: [],
        createdAt: new Date().toISOString(),
        queueHint: [],
        errorHistory: [],
      };

      const undoResult = await executor.executeJob(undoJob);
      expect(undoResult.success).toBe(true);

      const docAfterUndo = (await writeCache.getState(
        document.header.id,
        "global",
        "main",
      )) as DocumentModelDocument;
      expect(docAfterUndo.state.global.name).toBe("");

      writeCache.invalidate(document.header.id);

      const docAfterRebuild = (await writeCache.getState(
        document.header.id,
        "global",
        "main",
      )) as DocumentModelDocument;
      expect(docAfterRebuild.state.global.name).toBe("");
    });
  });

  describe("Consecutive UNDO rebuild", () => {
    it("should correctly rebuild document state when consecutive UNDOs exist", async () => {
      const document = documentModelDocumentModelModule.utils.createDocument();
      await createDocumentWithCreateOperation(
        document.header.id,
        document.header.documentType,
        document.state,
      );

      const setModelName1Job: Job = {
        id: "job-set-name-1",
        kind: "mutation",
        documentId: document.header.id,
        scope: "global",
        branch: "main",
        actions: [
          {
            id: generateId(),
            type: "SET_MODEL_NAME",
            scope: "global",
            timestampUtcMs: new Date().toISOString(),
            input: { name: "Name 1" },
          },
        ],
        operations: [],
        createdAt: new Date().toISOString(),
        queueHint: [],
        errorHistory: [],
      };

      await executor.executeJob(setModelName1Job);

      const setModelName2Job: Job = {
        id: "job-set-name-2",
        kind: "mutation",
        documentId: document.header.id,
        scope: "global",
        branch: "main",
        actions: [
          {
            id: generateId(),
            type: "SET_MODEL_NAME",
            scope: "global",
            timestampUtcMs: new Date().toISOString(),
            input: { name: "Name 2" },
          },
        ],
        operations: [],
        createdAt: new Date().toISOString(),
        queueHint: [],
        errorHistory: [],
      };

      await executor.executeJob(setModelName2Job);

      const docAfterSets = (await writeCache.getState(
        document.header.id,
        "global",
        "main",
      )) as DocumentModelDocument;
      expect(docAfterSets.state.global.name).toBe("Name 2");

      const undo1Job: Job = {
        id: "job-undo-1",
        kind: "mutation",
        documentId: document.header.id,
        scope: "global",
        branch: "main",
        actions: [
          {
            id: generateId(),
            type: "UNDO",
            scope: "global",
            timestampUtcMs: new Date().toISOString(),
            input: {},
          },
        ],
        operations: [],
        createdAt: new Date().toISOString(),
        queueHint: [],
        errorHistory: [],
      };

      const undo1Result = await executor.executeJob(undo1Job);
      expect(undo1Result.success).toBe(true);

      const docAfterUndo1 = (await writeCache.getState(
        document.header.id,
        "global",
        "main",
      )) as DocumentModelDocument;
      expect(docAfterUndo1.state.global.name).toBe("Name 1");

      const undo2Job: Job = {
        id: "job-undo-2",
        kind: "mutation",
        documentId: document.header.id,
        scope: "global",
        branch: "main",
        actions: [
          {
            id: generateId(),
            type: "UNDO",
            scope: "global",
            timestampUtcMs: new Date().toISOString(),
            input: {},
          },
        ],
        operations: [],
        createdAt: new Date().toISOString(),
        queueHint: [],
        errorHistory: [],
      };

      const undo2Result = await executor.executeJob(undo2Job);
      expect(undo2Result.success).toBe(true);

      const docAfterUndo2 = (await writeCache.getState(
        document.header.id,
        "global",
        "main",
      )) as DocumentModelDocument;
      expect(docAfterUndo2.state.global.name).toBe("");

      writeCache.invalidate(document.header.id);

      const docAfterRebuild = (await writeCache.getState(
        document.header.id,
        "global",
        "main",
      )) as DocumentModelDocument;
      expect(docAfterRebuild.state.global.name).toBe("");
    });

    it("should handle interleaved UNDOs and content operations", async () => {
      const document = documentModelDocumentModelModule.utils.createDocument();
      await createDocumentWithCreateOperation(
        document.header.id,
        document.header.documentType,
        document.state,
      );

      await executor.executeJob({
        id: "job-set-1",
        kind: "mutation",
        documentId: document.header.id,
        scope: "global",
        branch: "main",
        actions: [
          {
            id: generateId(),
            type: "SET_MODEL_NAME",
            scope: "global",
            timestampUtcMs: new Date().toISOString(),
            input: { name: "Name 1" },
          },
        ],
        operations: [],
        createdAt: new Date().toISOString(),
        queueHint: [],
        errorHistory: [],
      });

      await executor.executeJob({
        id: "job-set-2",
        kind: "mutation",
        documentId: document.header.id,
        scope: "global",
        branch: "main",
        actions: [
          {
            id: generateId(),
            type: "SET_MODEL_NAME",
            scope: "global",
            timestampUtcMs: new Date().toISOString(),
            input: { name: "Name 2" },
          },
        ],
        operations: [],
        createdAt: new Date().toISOString(),
        queueHint: [],
        errorHistory: [],
      });

      await executor.executeJob({
        id: "job-undo-1",
        kind: "mutation",
        documentId: document.header.id,
        scope: "global",
        branch: "main",
        actions: [
          {
            id: generateId(),
            type: "UNDO",
            scope: "global",
            timestampUtcMs: new Date().toISOString(),
            input: {},
          },
        ],
        operations: [],
        createdAt: new Date().toISOString(),
        queueHint: [],
        errorHistory: [],
      });

      await executor.executeJob({
        id: "job-undo-2",
        kind: "mutation",
        documentId: document.header.id,
        scope: "global",
        branch: "main",
        actions: [
          {
            id: generateId(),
            type: "UNDO",
            scope: "global",
            timestampUtcMs: new Date().toISOString(),
            input: {},
          },
        ],
        operations: [],
        createdAt: new Date().toISOString(),
        queueHint: [],
        errorHistory: [],
      });

      await executor.executeJob({
        id: "job-set-3",
        kind: "mutation",
        documentId: document.header.id,
        scope: "global",
        branch: "main",
        actions: [
          {
            id: generateId(),
            type: "SET_MODEL_NAME",
            scope: "global",
            timestampUtcMs: new Date().toISOString(),
            input: { name: "Name 3" },
          },
        ],
        operations: [],
        createdAt: new Date().toISOString(),
        queueHint: [],
        errorHistory: [],
      });

      const docBeforeRebuild = (await writeCache.getState(
        document.header.id,
        "global",
        "main",
      )) as DocumentModelDocument;
      expect(docBeforeRebuild.state.global.name).toBe("Name 3");

      writeCache.invalidate(document.header.id);

      const docAfterRebuild = (await writeCache.getState(
        document.header.id,
        "global",
        "main",
      )) as DocumentModelDocument;
      expect(docAfterRebuild.state.global.name).toBe("Name 3");
    });
  });
});
