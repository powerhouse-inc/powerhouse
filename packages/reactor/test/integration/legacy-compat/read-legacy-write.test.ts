import type { BaseDocumentDriveServer } from "document-drive";
import {
  MemoryStorage,
  ReactorBuilder,
  driveDocumentModelModule,
} from "document-drive";
import type { DocumentModelModule } from "document-model";
import { documentModelDocumentModelModule } from "document-model";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KyselyWriteCache } from "../../../src/cache/kysely-write-cache.js";
import type { WriteCacheConfig } from "../../../src/cache/write-cache-types.js";
import { Reactor } from "../../../src/core/reactor.js";
import { EventBus } from "../../../src/events/event-bus.js";
import type { IEventBus } from "../../../src/events/interfaces.js";
import type { IQueue } from "../../../src/queue/interfaces.js";
import { InMemoryQueue } from "../../../src/queue/queue.js";
import { ReadModelCoordinator } from "../../../src/read-models/coordinator.js";
import { KyselyDocumentView } from "../../../src/read-models/document-view.js";
import type { DocumentViewDatabase } from "../../../src/read-models/types.js";
import { DocumentModelRegistry } from "../../../src/registry/implementation.js";
import { ConsistencyTracker } from "../../../src/shared/consistency-tracker.js";
import { ConsistencyAwareLegacyStorage } from "../../../src/storage/consistency-aware-legacy-storage.js";
import type {
  IKeyframeStore,
  IOperationStore,
} from "../../../src/storage/interfaces.js";
import type { Database as StorageDatabase } from "../../../src/storage/kysely/types.js";
import {
  createDocModelDocument,
  createMockDocumentIndexer,
  createMockReactorFeatures,
  createTestDocuments,
  createTestJobTracker,
  createTestOperationStore,
} from "../../factories.js";

type Database = StorageDatabase & DocumentViewDatabase;

/**
 * These tests show that writing to the legacy reactor and reading from the new
 * reactor, when using legacy storage, works correctly.
 */
describe("Legacy Write -> Read", () => {
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

  const documentModels = [
    documentModelDocumentModelModule,
    driveDocumentModelModule,
  ] as DocumentModelModule<any>[];

  beforeEach(async () => {
    // Create shared storage
    storage = new MemoryStorage();

    // Create registry
    registry = new DocumentModelRegistry();
    registry.registerModules(
      documentModelDocumentModelModule,
      driveDocumentModelModule,
    );

    // Create real drive server with the storage
    const builder = new ReactorBuilder(documentModels);
    builder.withStorage(storage);
    driveServer = builder.build() as unknown as BaseDocumentDriveServer;
    await driveServer.initialize();

    // Create in-memory database for operation store
    const setup = await createTestOperationStore();
    db = setup.db as unknown as Kysely<Database>;
    operationStore = setup.store;
    keyframeStore = setup.keyframeStore;

    // Create event bus and queue
    eventBus = new EventBus();
    queue = new InMemoryQueue(eventBus);

    // Create write cache
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

    // Create real document view and read model coordinator
    const consistencyTracker = new ConsistencyTracker();
    const documentView = new KyselyDocumentView(
      db,
      operationStore,
      consistencyTracker,
    );
    await documentView.init();
    readModelCoordinator = new ReadModelCoordinator(eventBus, [documentView]);

    // Create reactor facade with all required dependencies
    const jobTracker = createTestJobTracker();
    const legacyStorageConsistencyTracker = new ConsistencyTracker();
    const consistencyAwareStorage = new ConsistencyAwareLegacyStorage(
      storage,
      legacyStorageConsistencyTracker,
      eventBus,
    );
    reactor = new Reactor(
      driveServer,
      consistencyAwareStorage,
      queue,
      jobTracker,
      readModelCoordinator,
      createMockReactorFeatures(),
      documentView,
      createMockDocumentIndexer(),
      operationStore,
    );
  });

  afterEach(async () => {
    readModelCoordinator.stop();
    await writeCache.shutdown();
    writeCache.clear();
    try {
      await db.destroy();
    } catch {
      //
    }
  });

  describe("getDocumentModels", () => {
    it("should retrieve document models", async () => {
      // Since we're using a real drive server with actual document models
      const result = await reactor.getDocumentModels();

      // The real drive server will have the document models we initialized it with
      expect(result.results).toHaveLength(2);
      // Check that we have the expected document models
      const modelIds = result.results.map((m) => m.documentModel.global.id);
      expect(modelIds.length).toBe(2);
      // The actual model IDs in the test setup
      expect(modelIds).toContain("powerhouse/document-model");
      expect(modelIds).toContain("powerhouse/document-drive");
    });

    it("should handle paging", async () => {
      // With only 2 document models, test paging with limit 1
      const result = await reactor.getDocumentModels(undefined, {
        cursor: "0",
        limit: 1,
      });

      expect(result.results).toHaveLength(1);
      expect(result.nextCursor).toBe("1");
      expect(result.next).toBeDefined();
    });
  });

  describe("get", () => {
    it("should retrieve a document by id", async () => {
      // First add a document to the drive server
      const document = createDocModelDocument({ id: "doc1" });
      await driveServer.addDocument(document);

      const result = await reactor.get("doc1");

      expect(result.document.header.id).toEqual("doc1");
      expect(result.childIds).toEqual([]);
    });

    it("should filter by scopes when view filter is provided", async () => {
      const document = createDocModelDocument({
        id: "doc1",
        state: {
          global: { someData: "global" },
          local: { someData: "local" },
          private: { someData: "private" },
        },
      });

      await driveServer.addDocument(document);

      const result = await reactor.get("doc1", { scopes: ["global", "local"] });

      expect(result.document.state).toHaveProperty("global");
      expect(result.document.state).toHaveProperty("local");
      expect(result.document.state).not.toHaveProperty("private");
    });

    it("should throw error if document not found", async () => {
      await expect(reactor.get("nonexistent")).rejects.toThrow();
    });
  });

  describe("getBySlug", () => {
    it("should retrieve a document by slug", async () => {
      const document = createDocModelDocument({
        id: "doc1",
        slug: "test-slug",
      });

      // Add a drive first
      await driveServer.addDrive({
        id: "drive1",
        global: { name: "Test Drive", icon: "icon" },
        local: {
          availableOffline: false,
          sharingType: "PUBLIC",
          listeners: [],
          triggers: [],
        },
      });

      // Add the document to the drive
      await driveServer.addDocument(document);

      const result = await reactor.getBySlug("test-slug");

      expect(result.document.header.id).toBe("doc1");
      expect(result.childIds).toEqual([]);
    });

    it("should throw error if document with slug not found", async () => {
      await expect(reactor.getBySlug("nonexistent")).rejects.toThrow(
        "Document not found with slug: nonexistent",
      );
    });
  });

  describe("getOperations", () => {
    it("should retrieve operations for a document", async () => {
      const mockOperations = {
        global: [
          {
            index: 0,
            timestampUtcMs: "2023-01-01T00:00:00.000Z",
            hash: "hash1",
            skip: 0,
            action: {
              id: "action1",
              type: "CREATE",
              timestampUtcMs: "2023-01-01T00:00:00.000Z",
              input: {},
              scope: "global",
            },
          },
        ],
        local: [
          {
            index: 1,
            timestampUtcMs: "2023-01-02T00:00:00.000Z",
            hash: "hash2",
            skip: 0,
            action: {
              id: "action2",
              type: "UPDATE",
              timestampUtcMs: "2023-01-02T00:00:00.000Z",
              input: { field: "value" },
              scope: "local",
            },
          },
        ],
      };

      const document = createDocModelDocument({ id: "doc1" });
      document.operations = mockOperations;
      await driveServer.addDocument(document);

      const result = await reactor.getOperations("doc1");

      // Check that operations were retrieved
      expect(result).toHaveProperty("global");
      expect(result).toHaveProperty("local");
      expect(result.global.results).toEqual(mockOperations.global);
      expect(result.local.results).toEqual(mockOperations.local);
    });

    it("should filter operations by scopes", async () => {
      const mockOperations = {
        global: [
          {
            index: 0,
            timestampUtcMs: "2023-01-01T00:00:00.000Z",
            hash: "hash1",
            skip: 0,
            action: {
              id: "action1",
              type: "CREATE",
              timestampUtcMs: "2023-01-01T00:00:00.000Z",
              input: {},
              scope: "global",
            },
          },
        ],
        local: [
          {
            index: 1,
            timestampUtcMs: "2023-01-02T00:00:00.000Z",
            hash: "hash2",
            skip: 0,
            action: {
              id: "action2",
              type: "UPDATE",
              timestampUtcMs: "2023-01-02T00:00:00.000Z",
              input: {},
              scope: "local",
            },
          },
        ],
        private: [
          {
            index: 2,
            timestampUtcMs: "2023-01-03T00:00:00.000Z",
            hash: "hash3",
            skip: 0,
            action: {
              id: "action3",
              type: "DELETE",
              timestampUtcMs: "2023-01-03T00:00:00.000Z",
              input: {},
              scope: "private",
            },
          },
        ],
      };

      const document = createDocModelDocument({ id: "doc1" });
      document.operations = mockOperations;
      await driveServer.addDocument(document);

      const result = await reactor.getOperations("doc1", {
        scopes: ["global", "local"],
      });

      expect(result).toHaveProperty("global");
      expect(result).toHaveProperty("local");
      expect(result).not.toHaveProperty("private");
    });
  });

  describe("find", () => {
    it("should filter documents by type", async () => {
      const doc1 = documentModelDocumentModelModule.utils.createDocument();
      doc1.header.id = "doc1";

      // Add a drive and documents
      await driveServer.addDrive({
        id: "drive1",
        global: { name: "Test Drive", icon: "icon" },
        local: {
          availableOffline: false,
          sharingType: "PUBLIC",
          listeners: [],
          triggers: [],
        },
      });
      await driveServer.addDocument(doc1);

      const result = await reactor.find({ type: "powerhouse/document-model" });

      expect(result.results).toHaveLength(1);
      expect(result.results[0].header.documentType).toBe(
        "powerhouse/document-model",
      );
    });

    it("should filter documents by ids", async () => {
      const documents = createTestDocuments(5, {});
      // Override IDs to match test expectations
      documents.forEach((doc, i) => {
        doc.header.id = `doc${i}`;
      });

      // Add a drive and documents
      await driveServer.addDrive({
        id: "drive1",
        global: { name: "Test Drive", icon: "icon" },
        local: {
          availableOffline: false,
          sharingType: "PUBLIC",
          listeners: [],
          triggers: [],
        },
      });

      for (const doc of documents) {
        await driveServer.addDocument(doc);
      }

      const result = await reactor.find({ ids: ["doc1", "doc3"] });

      expect(result.results).toHaveLength(2);
      expect(result.results.map((d) => d.header.id)).toEqual(["doc1", "doc3"]);
    });

    it("should filter documents by scopes when view filter is provided", async () => {
      const document = createDocModelDocument({
        id: "doc1",
        state: {
          global: { someData: "global" },
          local: { someData: "local" },
          private: { someData: "private" },
        },
      });

      // Add a drive and document
      await driveServer.addDrive({
        id: "drive1",
        global: { name: "Test Drive", icon: "icon" },
        local: {
          availableOffline: false,
          sharingType: "PUBLIC",
          listeners: [],
          triggers: [],
        },
      });
      await driveServer.addDocument(document);

      const result = await reactor.find(
        { type: "powerhouse/document-model" },
        { scopes: ["global"] },
      );

      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results[0].state).toHaveProperty("global");
      expect(result.results[0].state).not.toHaveProperty("local");
      expect(result.results[0].state).not.toHaveProperty("private");
    });
  });
});
