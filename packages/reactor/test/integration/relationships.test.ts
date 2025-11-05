import type {
  BaseDocumentDriveServer,
  IDocumentOperationStorage,
  IDocumentStorage,
} from "document-drive";
import {
  MemoryStorage,
  ReactorBuilder,
  driveDocumentModelModule,
} from "document-drive";
import type { DocumentModelModule } from "document-model";
import { documentModelDocumentModelModule } from "document-model";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KyselyWriteCache } from "../../src/cache/kysely-write-cache.js";
import type { WriteCacheConfig } from "../../src/cache/types.js";
import { Reactor } from "../../src/core/reactor.js";
import { EventBus } from "../../src/events/event-bus.js";
import type { IEventBus } from "../../src/events/interfaces.js";
import { SimpleJobExecutorManager } from "../../src/executor/simple-job-executor-manager.js";
import { SimpleJobExecutor } from "../../src/executor/simple-job-executor.js";
import type { IQueue } from "../../src/queue/interfaces.js";
import { InMemoryQueue } from "../../src/queue/queue.js";
import { ReadModelCoordinator } from "../../src/read-models/coordinator.js";
import { KyselyDocumentView } from "../../src/read-models/document-view.js";
import { ConsistencyTracker } from "../../src/shared/consistency-tracker.js";
import type { DocumentViewDatabase } from "../../src/read-models/types.js";
import { DocumentModelRegistry } from "../../src/registry/implementation.js";
import type { JobInfo } from "../../src/shared/types.js";
import { JobStatus } from "../../src/shared/types.js";
import type {
  DocumentRelationship,
  IKeyframeStore,
  IOperationStore,
} from "../../src/storage/interfaces.js";
import { KyselyDocumentIndexer } from "../../src/storage/kysely/document-indexer.js";
import type {
  DocumentIndexerDatabase,
  Database as StorageDatabase,
} from "../../src/storage/kysely/types.js";
import {
  createDocModelDocument,
  createMockReactorFeatures,
  createTestJobTracker,
  createTestOperationStore,
} from "../factories.js";

const documentModels = [
  documentModelDocumentModelModule,
  driveDocumentModelModule,
] as DocumentModelModule<any>[];

type Database = StorageDatabase &
  DocumentViewDatabase &
  DocumentIndexerDatabase;

describe("Integration Test: Relationship Operations", () => {
  let reactor: Reactor;
  let driveServer: BaseDocumentDriveServer;
  let storage: MemoryStorage;
  let eventBus: IEventBus;
  let queue: IQueue;
  let db: Kysely<Database>;
  let operationStore: IOperationStore;
  let keyframeStore: IKeyframeStore;
  let writeCache: KyselyWriteCache;
  let readModelCoordinator: ReadModelCoordinator;
  let registry: DocumentModelRegistry;
  let documentIndexer: KyselyDocumentIndexer;
  let executor: SimpleJobExecutor;
  let executorManager: SimpleJobExecutorManager;

  async function createDocument(doc: any): Promise<void> {
    const jobInfo = await reactor.create(doc);
    await waitForJobCompletion(jobInfo.id);
  }

  async function waitForJobCompletion(jobId: string): Promise<void> {
    await vi.waitUntil(
      async () => {
        const status = await reactor.getJobStatus(jobId);
        if (status.status === JobStatus.FAILED) {
          status.errorHistory?.forEach((error, index) => {
            console.error(`[Attempt ${index + 1}] ${error.message}`);
            console.error(
              `[Attempt ${index + 1}] Stack trace:\n${error.stack}`,
            );
          });

          throw new Error(status.error?.message || "Job failed");
        }

        return status.status === JobStatus.COMPLETED;
      },
      { timeout: 5000 },
    );
  }

  async function waitForJobFailure(jobId: string): Promise<JobInfo> {
    await vi.waitUntil(
      async () => {
        const status = await reactor.getJobStatus(jobId);
        if (status.status === JobStatus.COMPLETED) {
          throw new Error("Expected job to fail but it completed successfully");
        }
        return status.status === JobStatus.FAILED;
      },
      { timeout: 5000 },
    );

    return await reactor.getJobStatus(jobId);
  }

  async function waitForOutgoingCount(
    sourceId: string,
    expectedCount: number,
    types: string[] = ["child"],
  ): Promise<DocumentRelationship[]> {
    await vi.waitUntil(
      async () => {
        const results = await documentIndexer.getOutgoing(sourceId, types);
        return results.length === expectedCount;
      },
      { timeout: 5000 },
    );

    return documentIndexer.getOutgoing(sourceId, types);
  }

  async function waitForIncomingCount(
    targetId: string,
    expectedCount: number,
    types: string[] = ["child"],
  ): Promise<DocumentRelationship[]> {
    await vi.waitUntil(
      async () => {
        const results = await documentIndexer.getIncoming(targetId, types);
        return results.length === expectedCount;
      },
      { timeout: 5000 },
    );

    return documentIndexer.getIncoming(targetId, types);
  }

  beforeEach(async () => {
    storage = new MemoryStorage();

    registry = new DocumentModelRegistry();
    registry.registerModules(
      documentModelDocumentModelModule,
      driveDocumentModelModule,
    );

    const builder = new ReactorBuilder(documentModels);
    builder.withStorage(storage);
    driveServer = builder.build() as unknown as BaseDocumentDriveServer;
    await driveServer.initialize();

    const setup = await createTestOperationStore();
    db = setup.db as unknown as Kysely<Database>;
    operationStore = setup.store;
    keyframeStore = setup.keyframeStore;

    eventBus = new EventBus();
    queue = new InMemoryQueue(eventBus);

    const writeCacheConfig: WriteCacheConfig = {
      maxDocuments: 100,
      ringBufferSize: 10,
      keyframeInterval: 10,
    };

    writeCache = new KyselyWriteCache(
      keyframeStore,
      operationStore,
      registry,
      writeCacheConfig,
    );
    await writeCache.startup();

    executor = new SimpleJobExecutor(
      registry,
      storage as IDocumentStorage,
      storage as IDocumentOperationStorage,
      operationStore,
      eventBus,
      writeCache,
    );

    const jobTracker = createTestJobTracker();

    executorManager = new SimpleJobExecutorManager(
      () => executor,
      eventBus,
      queue,
      jobTracker,
    );

    await executorManager.start(1);

    const documentViewConsistencyTracker = new ConsistencyTracker();
    const documentView = new KyselyDocumentView(
      db as any,
      operationStore,
      documentViewConsistencyTracker,
    );
    await documentView.init();

    const documentIndexerConsistencyTracker = new ConsistencyTracker();
    documentIndexer = new KyselyDocumentIndexer(
      db as any,
      operationStore,
      documentIndexerConsistencyTracker,
    );
    await documentIndexer.init();

    readModelCoordinator = new ReadModelCoordinator(eventBus, [
      documentView,
      documentIndexer,
    ]);
    readModelCoordinator.start();

    reactor = new Reactor(
      driveServer,
      storage as IDocumentStorage,
      queue,
      jobTracker,
      readModelCoordinator,
      createMockReactorFeatures(),
      documentView,
      documentIndexer,
      operationStore,
    );
  });

  afterEach(async () => {
    await executorManager.stop();
    readModelCoordinator.stop();
    await writeCache.shutdown();
    writeCache.clear();
    try {
      await db.destroy();
    } catch {
      // ignore shutdown errors in tests
    }
  });

  describe("addChildren", () => {
    it("should add child relationships to a parent document", async () => {
      const parentDoc = createDocModelDocument({ id: "parent-1" });
      const childDoc1 = createDocModelDocument({ id: "child-1" });
      const childDoc2 = createDocModelDocument({ id: "child-2" });

      await createDocument(parentDoc);
      await createDocument(childDoc1);
      await createDocument(childDoc2);

      const jobInfo = await reactor.addChildren("parent-1", [
        "child-1",
        "child-2",
      ]);

      expect(jobInfo.id).toBeDefined();
      expect(jobInfo.status).toBe(JobStatus.PENDING);

      await waitForJobCompletion(jobInfo.id);

      const outgoing = await waitForOutgoingCount("parent-1", 2);
      expect(outgoing).toHaveLength(2);
      expect(outgoing.map((r) => r.targetId).sort()).toEqual([
        "child-1",
        "child-2",
      ]);
      expect(outgoing.every((r) => r.relationshipType === "child")).toBe(true);
    });

    it("should allow querying incoming child relationships", async () => {
      const parentDoc = createDocModelDocument({ id: "parent-2" });
      const childDoc = createDocModelDocument({ id: "child-3" });

      await createDocument(parentDoc);
      await createDocument(childDoc);

      const jobInfo = await reactor.addChildren("parent-2", ["child-3"]);
      await waitForJobCompletion(jobInfo.id);

      const incoming = await waitForIncomingCount("child-3", 1);
      expect(incoming).toHaveLength(1);
      expect(incoming[0].sourceId).toBe("parent-2");
      expect(incoming[0].targetId).toBe("child-3");
      expect(incoming[0].relationshipType).toBe("child");
    });

    it("should fail if parent document does not exist", async () => {
      const childDoc = createDocModelDocument({ id: "child-4" });
      await createDocument(childDoc);

      const jobInfo = await reactor.addChildren("nonexistent-parent", [
        "child-4",
      ]);

      const status = await waitForJobFailure(jobInfo.id);
      expect(status.status).toBe(JobStatus.FAILED);
      expect(status.error?.message).toContain("source document");
    });

    it("should fail if child document does not exist", async () => {
      const parentDoc = createDocModelDocument({ id: "parent-3" });
      await createDocument(parentDoc);

      const jobInfo = await reactor.addChildren("parent-3", ["missing-child"]);

      const status = await waitForJobFailure(jobInfo.id);
      expect(status.status).toBe(JobStatus.FAILED);
      expect(status.error?.message).toContain("target document");
    });

    it("should be idempotent when adding same relationship twice", async () => {
      const parentDoc = createDocModelDocument({ id: "parent-4" });
      const childDoc = createDocModelDocument({ id: "child-5" });

      await createDocument(parentDoc);
      await createDocument(childDoc);

      const firstJob = await reactor.addChildren("parent-4", ["child-5"]);
      await waitForJobCompletion(firstJob.id);

      const secondJob = await reactor.addChildren("parent-4", ["child-5"]);
      await waitForJobCompletion(secondJob.id);

      const outgoing = await waitForOutgoingCount("parent-4", 1);
      expect(outgoing).toHaveLength(1);
      expect(outgoing[0]?.targetId).toBe("child-5");
    });
  });

  describe("removeChildren", () => {
    it("should remove child relationships from a parent document", async () => {
      const parentDoc = createDocModelDocument({ id: "parent-5" });
      const childDoc = createDocModelDocument({ id: "child-6" });

      await createDocument(parentDoc);
      await createDocument(childDoc);

      const addJob = await reactor.addChildren("parent-5", ["child-6"]);
      await waitForJobCompletion(addJob.id);

      const removeJob = await reactor.removeChildren("parent-5", ["child-6"]);
      await waitForJobCompletion(removeJob.id);

      await vi.waitUntil(
        async () => {
          const outgoing = await documentIndexer.getOutgoing("parent-5", [
            "child",
          ]);
          return outgoing.length === 0;
        },
        { timeout: 5000 },
      );
    });

    it("should be idempotent when removing non-existent relationship", async () => {
      const parentDoc = createDocModelDocument({ id: "parent-6" });
      await createDocument(parentDoc);

      const removeJob = await reactor.removeChildren("parent-6", ["missing"]);
      await waitForJobCompletion(removeJob.id);

      const outgoing = await documentIndexer.getOutgoing("parent-6", ["child"]);
      expect(outgoing).toHaveLength(0);
    });
  });

  describe("Document Indexer Query Methods", () => {
    beforeEach(async () => {
      const parentDoc = createDocModelDocument({ id: "parent-7" });
      const childDoc1 = createDocModelDocument({ id: "child-7" });
      const childDoc2 = createDocModelDocument({ id: "child-8" });
      const grandChildDoc = createDocModelDocument({ id: "grandchild-1" });

      await createDocument(parentDoc);
      await createDocument(childDoc1);
      await createDocument(childDoc2);
      await createDocument(grandChildDoc);

      await waitForJobCompletion(
        (await reactor.addChildren("parent-7", ["child-7", "child-8"])).id,
      );
      await waitForJobCompletion(
        (await reactor.addChildren("child-7", ["grandchild-1"])).id,
      );

      await waitForOutgoingCount("parent-7", 2);
      await waitForOutgoingCount("child-7", 1);
    });

    it("should check if relationship exists", async () => {
      const exists = await documentIndexer.hasRelationship(
        "parent-7",
        "child-7",
        ["child"],
      );
      const missing = await documentIndexer.hasRelationship(
        "parent-7",
        "unknown",
        ["child"],
      );

      expect(exists).toBe(true);
      expect(missing).toBe(false);
    });

    it("should get directed relationships between two documents", async () => {
      const relationships = await documentIndexer.getDirectedRelationships(
        "parent-7",
        "child-7",
        ["child"],
      );

      expect(relationships).toHaveLength(1);
      expect(relationships[0]?.sourceId).toBe("parent-7");
      expect(relationships[0]?.targetId).toBe("child-7");
      expect(relationships[0]?.relationshipType).toBe("child");
    });

    it("should find path between documents", async () => {
      const path = await documentIndexer.findPath("parent-7", "grandchild-1", [
        "child",
      ]);

      expect(path).toEqual(["parent-7", "child-7", "grandchild-1"]);
    });

    it("should return null when no path exists", async () => {
      const path = await documentIndexer.findPath("child-8", "grandchild-1", [
        "child",
      ]);

      expect(path).toBeNull();
    });

    it("should find ancestors of a document", async () => {
      const graph = await documentIndexer.findAncestors("grandchild-1", [
        "child",
      ]);

      expect(graph.nodes.sort()).toEqual([
        "child-7",
        "grandchild-1",
        "parent-7",
      ]);
      expect(
        graph.edges.map((edge) => `${edge.from}-${edge.to}`).sort(),
      ).toEqual(["child-7-grandchild-1", "parent-7-child-7"]);
    });

    it("should get all relationship types", async () => {
      await vi.waitUntil(
        async () => {
          const types = await documentIndexer.getRelationshipTypes();
          return types.length > 0;
        },
        { timeout: 5000 },
      );

      const types = await documentIndexer.getRelationshipTypes();
      expect(types.sort()).toEqual(["child"]);
    });
  });
});
