import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  deriveOperationId,
  generateId,
} from "@powerhousedao/shared/document-model";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CollectionMembershipCache } from "../../src/cache/collection-membership-cache.js";
import { DocumentMetaCache } from "../../src/cache/document-meta-cache.js";
import { KyselyOperationIndex } from "../../src/cache/kysely-operation-index.js";
import { KyselyWriteCache } from "../../src/cache/kysely-write-cache.js";
import { DriveCollectionId } from "../../src/cache/operation-index-types.js";
import type { WriteCacheConfig } from "../../src/cache/write-cache-types.js";
import { DEFAULT_DRIVE_CONTAINER_TYPES } from "../../src/core/drive-container-types.js";
import { KyselyExecutionScope } from "../../src/executor/execution-scope.js";
import { SimpleJobExecutor } from "../../src/executor/simple-job-executor.js";
import type { Job } from "../../src/queue/types.js";
import { DocumentModelRegistry } from "../../src/registry/implementation.js";
import type { IDocumentModelRegistry } from "../../src/registry/interfaces.js";
import type { KyselyKeyframeStore } from "../../src/storage/kysely/keyframe-store.js";
import type { KyselyOperationStore } from "../../src/storage/kysely/store.js";
import type { Database as DatabaseSchema } from "../../src/storage/kysely/types.js";
import {
  createMockLogger,
  createTestEventBus,
  createTestOperationStorePostgres,
} from "../factories.js";

const DRIVE_TYPE = "powerhouse/document-drive";

/** PGLite's one connection queues the concurrent read behind the transaction. */
describe("collection membership cache coherence [Postgres]", () => {
  let registry: IDocumentModelRegistry;
  let db: Kysely<DatabaseSchema>;
  let operationStore: KyselyOperationStore;
  let keyframeStore: KyselyKeyframeStore;
  let writeCache: KyselyWriteCache;
  let operationIndex: KyselyOperationIndex;
  let documentMetaCache: DocumentMetaCache;
  let collectionMembershipCache: CollectionMembershipCache;
  let executor: SimpleJobExecutor;
  let cleanup: () => Promise<void>;

  async function createDocument(
    documentId: string,
    documentType: string,
    state: unknown,
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
        input: { state },
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

    if (documentType === DRIVE_TYPE) {
      const collectionId = DriveCollectionId.forDrive(documentId).key;
      indexTxn.createCollection(collectionId);
      indexTxn.addToCollection(collectionId, documentId);
    }

    await operationIndex.commit(indexTxn);
  }

  beforeEach(async () => {
    registry = new DocumentModelRegistry();
    registry.registerModules(driveDocumentModelModule);

    const setup = await createTestOperationStorePostgres();
    db = setup.db;
    operationStore = setup.store;
    keyframeStore = setup.keyframeStore;
    cleanup = setup.cleanup;

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

    const executionScope = new KyselyExecutionScope(
      db,
      operationStore,
      operationIndex,
      keyframeStore,
      writeCache,
      documentMetaCache,
      collectionMembershipCache,
    );

    executor = new SimpleJobExecutor(
      createMockLogger(),
      registry,
      operationStore,
      createTestEventBus(),
      writeCache,
      operationIndex,
      documentMetaCache,
      collectionMembershipCache,
      DEFAULT_DRIVE_CONTAINER_TYPES,
      {},
      undefined,
      executionScope,
    );
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await writeCache.shutdown();
    await documentMetaCache.shutdown();
    await cleanup();
  });

  it("does not leave pre-job membership cached after ADD_RELATIONSHIP commits", async () => {
    const driveDoc = driveDocumentModelModule.utils.createDocument();
    const driveId = driveDoc.header.id;
    await createDocument(driveId, DRIVE_TYPE, driveDoc.state);

    const childDoc = driveDocumentModelModule.utils.createDocument();
    const childId = childDoc.header.id;
    await createDocument(childId, DRIVE_TYPE, childDoc.state);

    const realCommit = KyselyOperationIndex.prototype.commit;
    let injected = false;
    const spy = vi
      .spyOn(KyselyOperationIndex.prototype, "commit")
      .mockImplementation(async function (
        this: KyselyOperationIndex,
        txn,
        signal,
      ) {
        if (!injected) {
          injected = true;
          await collectionMembershipCache.getCollectionsForDocuments([childId]);
        }
        return realCommit.call(this, txn, signal);
      });

    const job: Job = {
      id: "job-add-relationship",
      kind: "mutation",
      documentId: driveId,
      scope: "document",
      branch: "main",
      actions: [
        {
          id: "add-rel-action",
          type: "ADD_RELATIONSHIP",
          scope: "document",
          timestampUtcMs: new Date().toISOString(),
          input: {
            sourceId: driveId,
            targetId: childId,
            relationshipType: "child",
          },
        },
      ],
      operations: [],
      createdAt: new Date().toISOString(),
      queueHint: [],
      errorHistory: [],
      meta: { batchId: "test", batchJobIds: ["job-add-relationship"] },
    };

    const result = await executor.executeJob(job);
    expect(result.success).toBe(true);
    expect(injected).toBe(true);
    spy.mockRestore();

    const collectionId = DriveCollectionId.forDrive(driveId).key;

    const fromIndex = await operationIndex.getCollectionsForDocuments([
      childId,
    ]);
    expect(fromIndex[childId]).toContain(collectionId);

    const fromCache =
      await collectionMembershipCache.getCollectionsForDocuments([childId]);
    expect(fromCache[childId]).toContain(collectionId);
  });
});
