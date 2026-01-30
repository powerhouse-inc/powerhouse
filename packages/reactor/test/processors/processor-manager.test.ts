import { PGlite } from "@electric-sql/pglite";
import { driveDocumentModelModule } from "document-drive";
import type { DocumentModelModule, PHDocumentHeader } from "document-model";
import { documentModelDocumentModelModule, generateId } from "document-model";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KyselyOperationIndex } from "../../src/cache/kysely-operation-index.js";
import type { IOperationIndex } from "../../src/cache/operation-index-types.js";
import type { IWriteCache } from "../../src/cache/write/interfaces.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { Database, ReactorModule } from "../../src/core/types.js";
import { ProcessorManager } from "../../src/processors/processor-manager.js";
import type {
  IProcessor,
  ProcessorFactory,
  ProcessorFilter,
} from "../../src/processors/types.js";
import type { DocumentViewDatabase } from "../../src/read-models/types.js";
import { ConsistencyTracker } from "../../src/shared/consistency-tracker.js";
import { JobStatus } from "../../src/shared/types.js";
import type { OperationWithContext } from "../../src/storage/interfaces.js";
import type { Database as StorageDatabase } from "../../src/storage/kysely/types.js";
import {
  REACTOR_SCHEMA,
  runMigrations,
} from "../../src/storage/migrations/migrator.js";

const DRIVE_DOCUMENT_TYPE = "powerhouse/document-drive";

type CombinedDatabase = StorageDatabase & DocumentViewDatabase;

function createMockProcessor(): IProcessor & {
  receivedOperations: OperationWithContext[];
  disconnected: boolean;
} {
  const processor = {
    receivedOperations: [] as OperationWithContext[],
    disconnected: false,
    onOperations: vi.fn().mockImplementation((ops: OperationWithContext[]) => {
      processor.receivedOperations.push(...ops);
      return Promise.resolve();
    }),
    onDisconnect: vi.fn().mockImplementation(() => {
      processor.disconnected = true;
      return Promise.resolve();
    }),
  };
  return processor;
}

function createMockProcessorFactory(filter: ProcessorFilter = {}): {
  factory: ProcessorFactory;
  processor: ReturnType<typeof createMockProcessor>;
  factoryCallCount: number;
  lastDriveHeader: PHDocumentHeader | undefined;
} {
  const processor = createMockProcessor();
  let factoryCallCount = 0;
  let lastDriveHeader: PHDocumentHeader | undefined;

  const factory: ProcessorFactory = (driveHeader: PHDocumentHeader) => {
    factoryCallCount++;
    lastDriveHeader = driveHeader;
    return [{ processor, filter }];
  };

  return {
    factory,
    processor,
    get factoryCallCount() {
      return factoryCallCount;
    },
    get lastDriveHeader() {
      return lastDriveHeader;
    },
  };
}

describe("ProcessorManager Integration Tests", () => {
  let reactorModule: ReactorModule;

  beforeEach(async () => {
    reactorModule = await new ReactorBuilder()
      .withDocumentModels([
        documentModelDocumentModelModule as unknown as DocumentModelModule,
        driveDocumentModelModule as unknown as DocumentModelModule,
      ])
      .buildModule();
  });

  afterEach(async () => {
    reactorModule.reactor.kill();
    await reactorModule.database.destroy();
  });

  describe("Drive Detection and Processor Creation", () => {
    it("should detect drive creation and call factory with drive header", async () => {
      const mockFactory = createMockProcessorFactory();

      await reactorModule.processorManager.registerFactory(
        "test-factory",
        mockFactory.factory,
      );

      const driveDoc = driveDocumentModelModule.utils.createDocument();

      const result = await reactorModule.reactor.create(driveDoc);
      expect(result.status).toBe(JobStatus.PENDING);

      await vi.waitFor(
        () => {
          expect(mockFactory.factoryCallCount).toBe(1);
        },
        { timeout: 5000 },
      );

      expect(mockFactory.lastDriveHeader).toBeDefined();
      expect(mockFactory.lastDriveHeader?.documentType).toBe(
        DRIVE_DOCUMENT_TYPE,
      );
    });

    it("should track processors for the created drive", async () => {
      const { factory, processor } = createMockProcessorFactory();

      await reactorModule.processorManager.registerFactory(
        "test-factory",
        factory,
      );

      const driveDoc = driveDocumentModelModule.utils.createDocument();
      const driveId = driveDoc.header.id;

      await reactorModule.reactor.create(driveDoc);

      await vi.waitFor(() => {
        const processors =
          reactorModule.processorManager.getProcessorsForDrive(driveId);
        expect(processors).toHaveLength(1);
        expect(processors[0].processor).toBe(processor);
      });
    });
  });

  describe("Operation Routing", () => {
    it("should route operations to processor with matching filter", async () => {
      const filter: ProcessorFilter = {
        documentType: [DRIVE_DOCUMENT_TYPE],
      };
      const { factory, processor } = createMockProcessorFactory(filter);

      await reactorModule.processorManager.registerFactory(
        "test-factory",
        factory,
      );

      const driveDoc = driveDocumentModelModule.utils.createDocument();
      await reactorModule.reactor.create(driveDoc);

      await vi.waitFor(() => {
        expect(processor.receivedOperations.length).toBeGreaterThan(0);
      });

      const driveOps = processor.receivedOperations.filter(
        (op) => op.context.documentType === DRIVE_DOCUMENT_TYPE,
      );
      expect(driveOps.length).toBeGreaterThan(0);
    });

    it("should not route operations that do not match filter", async () => {
      const filter: ProcessorFilter = {
        documentType: ["nonexistent/document-type"],
      };
      const { factory, processor } = createMockProcessorFactory(filter);

      await reactorModule.processorManager.registerFactory(
        "test-factory",
        factory,
      );

      const driveDoc = driveDocumentModelModule.utils.createDocument();
      await reactorModule.reactor.create(driveDoc);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(processor.receivedOperations).toHaveLength(0);
    });

    it("should route all operations when filter is empty", async () => {
      const filter: ProcessorFilter = {};
      const { factory, processor } = createMockProcessorFactory(filter);

      await reactorModule.processorManager.registerFactory(
        "test-factory",
        factory,
      );

      const driveDoc = driveDocumentModelModule.utils.createDocument();
      await reactorModule.reactor.create(driveDoc);

      await vi.waitFor(() => {
        expect(processor.receivedOperations.length).toBeGreaterThan(0);
      });
    });
  });

  describe("Filter Variations", () => {
    it("should filter by scope", async () => {
      const filter: ProcessorFilter = {
        scope: ["document"],
        documentType: [DRIVE_DOCUMENT_TYPE],
      };
      const { factory, processor } = createMockProcessorFactory(filter);

      await reactorModule.processorManager.registerFactory(
        "test-factory",
        factory,
      );

      const driveDoc = driveDocumentModelModule.utils.createDocument();
      await reactorModule.reactor.create(driveDoc);

      await vi.waitFor(
        () => {
          expect(processor.receivedOperations.length).toBeGreaterThan(0);
        },
        { timeout: 5000 },
      );

      const nonDocumentOps = processor.receivedOperations.filter(
        (op) => op.context.scope !== "document",
      );
      expect(nonDocumentOps).toHaveLength(0);
    });

    it("should filter by branch", async () => {
      const filter: ProcessorFilter = {
        branch: ["main"],
      };
      const { factory, processor } = createMockProcessorFactory(filter);

      await reactorModule.processorManager.registerFactory(
        "test-factory",
        factory,
      );

      const driveDoc = driveDocumentModelModule.utils.createDocument();
      await reactorModule.reactor.create(driveDoc);

      await vi.waitFor(() => {
        expect(processor.receivedOperations.length).toBeGreaterThan(0);
      });

      const nonMainOps = processor.receivedOperations.filter(
        (op) => op.context.branch !== "main",
      );
      expect(nonMainOps).toHaveLength(0);
    });

    it("should filter by documentId", async () => {
      const driveDoc = driveDocumentModelModule.utils.createDocument();
      const driveId = driveDoc.header.id;

      const filter: ProcessorFilter = {
        documentId: [driveId],
      };
      const { factory, processor } = createMockProcessorFactory(filter);

      await reactorModule.processorManager.registerFactory(
        "test-factory",
        factory,
      );
      await reactorModule.reactor.create(driveDoc);

      await vi.waitFor(() => {
        expect(processor.receivedOperations.length).toBeGreaterThan(0);
      });

      const wrongDocOps = processor.receivedOperations.filter(
        (op) => op.context.documentId !== driveId,
      );
      expect(wrongDocOps).toHaveLength(0);
    });

    it("should apply combined filters with AND logic", async () => {
      const filter: ProcessorFilter = {
        documentType: [DRIVE_DOCUMENT_TYPE],
        scope: ["document"],
        branch: ["main"],
      };
      const { factory, processor } = createMockProcessorFactory(filter);

      await reactorModule.processorManager.registerFactory(
        "test-factory",
        factory,
      );

      const driveDoc = driveDocumentModelModule.utils.createDocument();
      await reactorModule.reactor.create(driveDoc);

      await vi.waitFor(
        () => {
          expect(processor.receivedOperations.length).toBeGreaterThan(0);
        },
        { timeout: 5000 },
      );

      for (const op of processor.receivedOperations) {
        expect(op.context.documentType).toBe(DRIVE_DOCUMENT_TYPE);
        expect(op.context.scope).toBe("document");
        expect(op.context.branch).toBe("main");
      }
    });
  });

  describe("Factory Lifecycle", () => {
    it("should track registered factory identifiers", async () => {
      const { factory: factory1 } = createMockProcessorFactory();
      const { factory: factory2 } = createMockProcessorFactory();

      await reactorModule.processorManager.registerFactory(
        "factory-1",
        factory1,
      );
      await reactorModule.processorManager.registerFactory(
        "factory-2",
        factory2,
      );

      const identifiers =
        reactorModule.processorManager.getFactoryIdentifiers();
      expect(identifiers).toContain("factory-1");
      expect(identifiers).toContain("factory-2");
    });

    it("should disconnect processors when factory is unregistered", async () => {
      const { factory, processor } = createMockProcessorFactory();

      await reactorModule.processorManager.registerFactory(
        "test-factory",
        factory,
      );

      const driveDoc = driveDocumentModelModule.utils.createDocument();
      await reactorModule.reactor.create(driveDoc);

      await vi.waitFor(() => {
        const processors = reactorModule.processorManager.getProcessorsForDrive(
          driveDoc.header.id,
        );
        expect(processors).toHaveLength(1);
      });

      await reactorModule.processorManager.unregisterFactory("test-factory");

      expect(processor.disconnected).toBe(true);
      expect(processor.onDisconnect).toHaveBeenCalled();
    });

    it("should remove factory from identifiers after unregistration", async () => {
      const { factory } = createMockProcessorFactory();

      await reactorModule.processorManager.registerFactory(
        "test-factory",
        factory,
      );
      expect(reactorModule.processorManager.getFactoryIdentifiers()).toContain(
        "test-factory",
      );

      await reactorModule.processorManager.unregisterFactory("test-factory");
      expect(
        reactorModule.processorManager.getFactoryIdentifiers(),
      ).not.toContain("test-factory");
    });

    it("should create processors for existing drives when factory is registered late", async () => {
      const driveDoc = driveDocumentModelModule.utils.createDocument();
      const driveId = driveDoc.header.id;

      await reactorModule.reactor.create(driveDoc);

      await vi.waitFor(
        () => {
          const processors =
            reactorModule.processorManager.getProcessorsForDrive(driveId);
          return processors.length >= 0;
        },
        { timeout: 5000 },
      );

      await new Promise((resolve) => setTimeout(resolve, 500));

      const mockFactory = createMockProcessorFactory();
      await reactorModule.processorManager.registerFactory(
        "late-factory",
        mockFactory.factory,
      );

      await vi.waitFor(
        () => {
          expect(mockFactory.factoryCallCount).toBe(1);
        },
        { timeout: 5000 },
      );
    });
  });

  describe("Error Handling", () => {
    it("should continue routing to other processors when one throws", async () => {
      const goodProcessor = createMockProcessor();
      const badProcessor = createMockProcessor();
      badProcessor.onOperations = vi
        .fn()
        .mockRejectedValue(new Error("Test error"));

      const goodFactory: ProcessorFactory = () => [
        { processor: goodProcessor, filter: {} },
      ];
      const badFactory: ProcessorFactory = () => [
        { processor: badProcessor, filter: {} },
      ];

      await reactorModule.processorManager.registerFactory(
        "good-factory",
        goodFactory,
      );
      await reactorModule.processorManager.registerFactory(
        "bad-factory",
        badFactory,
      );

      const driveDoc = driveDocumentModelModule.utils.createDocument();
      await reactorModule.reactor.create(driveDoc);

      await vi.waitFor(() => {
        expect(goodProcessor.receivedOperations.length).toBeGreaterThan(0);
      });
    });

    it("should handle factory errors gracefully", async () => {
      const errorFactory: ProcessorFactory = () => {
        throw new Error("Factory error");
      };

      await reactorModule.processorManager.registerFactory(
        "error-factory",
        errorFactory,
      );

      const driveDoc = driveDocumentModelModule.utils.createDocument();
      const result = await reactorModule.reactor.create(driveDoc);

      expect(result.status).toBe(JobStatus.PENDING);

      await vi.waitFor(
        async () => {
          const status = await reactorModule.reactor.getJobStatus(result.id);
          expect(status.status).toBe(JobStatus.READ_READY);
        },
        { timeout: 5000 },
      );
    });
  });
});

describe("ProcessorManager Standalone Tests", () => {
  let db: Kysely<CombinedDatabase>;
  let processorManager: ProcessorManager;
  let operationIndex: IOperationIndex;
  let mockWriteCache: IWriteCache;

  beforeEach(async () => {
    const dialect = new PGliteDialect(new PGlite());
    const baseDb = new Kysely<Database>({
      dialect,
    });

    const result = await runMigrations(baseDb, REACTOR_SCHEMA);
    if (!result.success && result.error) {
      throw new Error(`Test migration failed: ${result.error.message}`);
    }

    db = baseDb.withSchema(
      REACTOR_SCHEMA,
    ) as unknown as Kysely<CombinedDatabase>;

    operationIndex = new KyselyOperationIndex(
      db as unknown as Kysely<StorageDatabase>,
    );

    mockWriteCache = {
      getState: vi.fn().mockResolvedValue({}),
      putState: vi.fn(),
      invalidate: vi.fn().mockReturnValue(0),
      clear: vi.fn(),
      startup: vi.fn().mockResolvedValue(undefined),
      shutdown: vi.fn().mockResolvedValue(undefined),
    };

    const consistencyTracker = new ConsistencyTracker();
    processorManager = new ProcessorManager(
      db as unknown as Kysely<DocumentViewDatabase>,
      operationIndex,
      mockWriteCache,
      consistencyTracker,
    );

    await processorManager.init();
  });

  afterEach(async () => {
    await db.destroy();
  });

  describe("init", () => {
    it("should initialize ViewState table entry", async () => {
      const viewState = await db
        .selectFrom("ViewState")
        .selectAll()
        .where("readModelId", "=", "processor-manager")
        .executeTakeFirst();

      expect(viewState).toBeDefined();
      expect(viewState?.lastOrdinal).toBe(0);
    });
  });

  describe("indexOperations", () => {
    it("should detect drive creation from operations", async () => {
      const mockFactory = createMockProcessorFactory();
      await processorManager.registerFactory(
        "test-factory",
        mockFactory.factory,
      );

      const driveId = generateId();
      const operations: OperationWithContext[] = [
        {
          operation: {
            id: generateId(),
            index: 0,
            skip: 0,
            hash: "hash-0",
            timestampUtcMs: new Date().toISOString(),
            action: {
              id: generateId(),
              type: "CREATE_DOCUMENT",
              scope: "document",
              timestampUtcMs: new Date().toISOString(),
              input: {
                documentId: driveId,
                model: DRIVE_DOCUMENT_TYPE,
              },
            },
          },
          context: {
            documentId: driveId,
            documentType: DRIVE_DOCUMENT_TYPE,
            scope: "document",
            branch: "main",
            ordinal: 1,
            resultingState: JSON.stringify({
              header: {
                id: driveId,
                documentType: DRIVE_DOCUMENT_TYPE,
                revision: {},
                createdAtUtcIso: new Date().toISOString(),
                lastModifiedAtUtcIso: new Date().toISOString(),
              },
            }),
          },
        },
      ];

      await processorManager.indexOperations(operations);

      expect(mockFactory.factoryCallCount).toBe(1);
      expect(processorManager.getProcessorsForDrive(driveId)).toHaveLength(1);
    });

    it("should route operations to matching processors", async () => {
      const driveId = generateId();
      const filter: ProcessorFilter = {
        documentType: [DRIVE_DOCUMENT_TYPE],
      };
      const { factory, processor } = createMockProcessorFactory(filter);

      await processorManager.registerFactory("test-factory", factory);

      const createOp: OperationWithContext = {
        operation: {
          id: generateId(),
          index: 0,
          skip: 0,
          hash: "hash-0",
          timestampUtcMs: new Date().toISOString(),
          action: {
            id: generateId(),
            type: "CREATE_DOCUMENT",
            scope: "document",
            timestampUtcMs: new Date().toISOString(),
            input: { documentId: driveId, model: DRIVE_DOCUMENT_TYPE },
          },
        },
        context: {
          documentId: driveId,
          documentType: DRIVE_DOCUMENT_TYPE,
          scope: "document",
          branch: "main",
          ordinal: 1,
          resultingState: JSON.stringify({
            header: {
              id: driveId,
              documentType: DRIVE_DOCUMENT_TYPE,
              revision: {},
              createdAtUtcIso: new Date().toISOString(),
              lastModifiedAtUtcIso: new Date().toISOString(),
            },
          }),
        },
      };

      await processorManager.indexOperations([createOp]);

      const updateOp: OperationWithContext = {
        operation: {
          id: generateId(),
          index: 1,
          skip: 0,
          hash: "hash-1",
          timestampUtcMs: new Date().toISOString(),
          action: {
            id: generateId(),
            type: "SET_DRIVE_NAME",
            scope: "global",
            timestampUtcMs: new Date().toISOString(),
            input: { name: "Updated Drive" },
          },
        },
        context: {
          documentId: driveId,
          documentType: DRIVE_DOCUMENT_TYPE,
          scope: "global",
          branch: "main",
          ordinal: 2,
          resultingState: JSON.stringify({ global: { name: "Updated Drive" } }),
        },
      };

      await processorManager.indexOperations([updateOp]);

      expect(processor.receivedOperations).toHaveLength(2);
    });

    it("should update ViewState after processing", async () => {
      const driveId = generateId();
      const operations: OperationWithContext[] = [
        {
          operation: {
            id: generateId(),
            index: 0,
            skip: 0,
            hash: "hash-0",
            timestampUtcMs: new Date().toISOString(),
            action: {
              id: generateId(),
              type: "CREATE_DOCUMENT",
              scope: "document",
              timestampUtcMs: new Date().toISOString(),
              input: { documentId: driveId, model: DRIVE_DOCUMENT_TYPE },
            },
          },
          context: {
            documentId: driveId,
            documentType: DRIVE_DOCUMENT_TYPE,
            scope: "document",
            branch: "main",
            ordinal: 42,
            resultingState: JSON.stringify({
              header: {
                id: driveId,
                documentType: DRIVE_DOCUMENT_TYPE,
                revision: {},
                createdAtUtcIso: new Date().toISOString(),
                lastModifiedAtUtcIso: new Date().toISOString(),
              },
            }),
          },
        },
      ];

      await processorManager.indexOperations(operations);

      const viewState = await db
        .selectFrom("ViewState")
        .selectAll()
        .where("readModelId", "=", "processor-manager")
        .executeTakeFirst();

      expect(viewState?.lastOrdinal).toBe(42);
    });
  });
});
