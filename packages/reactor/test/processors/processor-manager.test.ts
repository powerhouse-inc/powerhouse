import { PGlite } from "@electric-sql/pglite";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  generateId,
  type DocumentModelModule,
  type OperationWithContext,
  type PHDocumentHeader,
} from "@powerhousedao/shared/document-model";
import type {
  IProcessor,
  ProcessorFactory,
  ProcessorFilter,
} from "@powerhousedao/shared/processors";
import {
  ConsoleLogger,
  documentModelDocumentModelModule,
} from "document-model";
import { Kysely, sql } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KyselyOperationIndex } from "../../src/cache/kysely-operation-index.js";
import type { IOperationIndex } from "../../src/cache/operation-index-types.js";
import type { IWriteCache } from "../../src/cache/write/interfaces.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { Database, ReactorModule } from "../../src/core/types.js";
import { ProcessorManager } from "../../src/processors/processor-manager.js";
import type { DocumentViewDatabase } from "../../src/read-models/types.js";
import { ConsistencyTracker } from "../../src/shared/consistency-tracker.js";
import { JobStatus } from "../../src/shared/types.js";
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

function makeDriveCreateOp(
  driveId: string,
  ordinal: number,
): OperationWithContext {
  return {
    operation: {
      id: generateId(),
      index: 0,
      skip: 0,
      hash: `hash-${ordinal}`,
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
      ordinal,
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
}

function makeOp(
  driveId: string,
  ordinal: number,
  overrides: Partial<{
    actionType: string;
    documentType: string;
    scope: string;
    branch: string;
    index: number;
  }> = {},
): OperationWithContext {
  return {
    operation: {
      id: generateId(),
      index: overrides.index ?? ordinal,
      skip: 0,
      hash: `hash-${ordinal}`,
      timestampUtcMs: new Date().toISOString(),
      action: {
        id: generateId(),
        type: overrides.actionType ?? "SET_DRIVE_NAME",
        scope: overrides.scope ?? "global",
        timestampUtcMs: new Date().toISOString(),
        input: { name: `Drive at ordinal ${ordinal}` },
      },
    },
    context: {
      documentId: driveId,
      documentType: overrides.documentType ?? DRIVE_DOCUMENT_TYPE,
      scope: overrides.scope ?? "global",
      branch: overrides.branch ?? "main",
      ordinal,
      resultingState: JSON.stringify({
        global: { name: `Drive at ordinal ${ordinal}` },
      }),
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
        const allProcessors = reactorModule.processorManager.getAll();
        const driveProcessors = allProcessors.filter(
          (p) => p.driveId === driveId,
        );
        expect(driveProcessors).toHaveLength(1);
        expect(driveProcessors[0]!.record.processor).toBe(processor);
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
    it("should track registered factories via getAll", async () => {
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

      const driveDoc = driveDocumentModelModule.utils.createDocument();
      await reactorModule.reactor.create(driveDoc);

      await vi.waitFor(() => {
        const all = reactorModule.processorManager.getAll();
        const factoryIds = new Set(all.map((p) => p.factoryId));
        expect(factoryIds.has("factory-1")).toBe(true);
        expect(factoryIds.has("factory-2")).toBe(true);
      });
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
        const all = reactorModule.processorManager.getAll();
        const driveProcessors = all.filter(
          (p) => p.driveId === driveDoc.header.id,
        );
        expect(driveProcessors).toHaveLength(1);
      });

      await reactorModule.processorManager.unregisterFactory("test-factory");

      expect(processor.disconnected).toBe(true);
      expect(processor.onDisconnect).toHaveBeenCalled();
    });

    it("should remove factory processors after unregistration", async () => {
      const { factory } = createMockProcessorFactory();

      await reactorModule.processorManager.registerFactory(
        "test-factory",
        factory,
      );

      const driveDoc = driveDocumentModelModule.utils.createDocument();
      await reactorModule.reactor.create(driveDoc);

      await vi.waitFor(() => {
        const allBefore = reactorModule.processorManager.getAll();
        const factoryIds = new Set(allBefore.map((p) => p.factoryId));
        expect(factoryIds.has("test-factory")).toBe(true);
      });

      await reactorModule.processorManager.unregisterFactory("test-factory");

      const allAfter = reactorModule.processorManager.getAll();
      const factoryIdsAfter = new Set(allAfter.map((p) => p.factoryId));
      expect(factoryIdsAfter.has("test-factory")).toBe(false);
    });

    it("should create processors for existing drives when factory is registered late", async () => {
      const driveDoc = driveDocumentModelModule.utils.createDocument();

      await reactorModule.reactor.create(driveDoc);

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

async function writeToOperationIndex(
  oi: IOperationIndex,
  ops: OperationWithContext[],
): Promise<void> {
  const txn = oi.start();
  txn.write(
    ops.map((op) => ({
      id: op.operation.id,
      index: op.operation.index,
      skip: op.operation.skip,
      hash: op.operation.hash,
      timestampUtcMs: op.operation.timestampUtcMs,
      action: op.operation.action,
      documentId: op.context.documentId,
      documentType: op.context.documentType,
      scope: op.context.scope,
      branch: op.context.branch,
      sourceRemote: "",
    })),
  );
  await oi.commit(txn);
}

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
    const logger = new ConsoleLogger(["test"]);
    processorManager = new ProcessorManager(
      db as unknown as Kysely<DocumentViewDatabase>,
      operationIndex,
      mockWriteCache,
      consistencyTracker,
      logger,
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

    it("should discover existing drives from DocumentSnapshot on restart", async () => {
      const driveId = generateId();

      await db
        .insertInto("DocumentSnapshot")
        .values({
          id: generateId(),
          documentId: driveId,
          slug: "test-drive",
          name: "Test Drive",
          scope: "global",
          branch: "main",
          content: JSON.stringify({}),
          documentType: DRIVE_DOCUMENT_TYPE,
          lastOperationIndex: 0,
          lastOperationHash: "hash-0",
          identifiers: JSON.stringify({}),
          metadata: JSON.stringify({}),
        })
        .execute();

      await db
        .updateTable("ViewState")
        .set({ lastOrdinal: 10 })
        .where("readModelId", "=", "processor-manager")
        .execute();

      const consistencyTracker = new ConsistencyTracker();
      const logger = new ConsoleLogger(["test"]);
      const restartedManager = new ProcessorManager(
        db as unknown as Kysely<DocumentViewDatabase>,
        operationIndex,
        mockWriteCache,
        consistencyTracker,
        logger,
      );
      await restartedManager.init();

      const mockFactory = createMockProcessorFactory();
      await restartedManager.registerFactory(
        "test-factory",
        mockFactory.factory,
      );

      expect(mockFactory.factoryCallCount).toBe(1);
      expect(mockFactory.lastDriveHeader?.id).toBe(driveId);

      const driveProcessors = restartedManager
        .getAll()
        .filter((p) => p.driveId === driveId);
      expect(driveProcessors).toHaveLength(1);
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
        makeDriveCreateOp(driveId, 1),
      ];

      await processorManager.indexOperations(operations);

      expect(mockFactory.factoryCallCount).toBe(1);
      const driveProcessors = processorManager
        .getAll()
        .filter((p) => p.driveId === driveId);
      expect(driveProcessors).toHaveLength(1);
    });

    it("should route operations to matching processors", async () => {
      const driveId = generateId();
      const filter: ProcessorFilter = {
        documentType: [DRIVE_DOCUMENT_TYPE],
      };
      const { factory, processor } = createMockProcessorFactory(filter);

      await processorManager.registerFactory("test-factory", factory);

      const createOp = makeDriveCreateOp(driveId, 1);
      await processorManager.indexOperations([createOp]);

      const updateOp = makeOp(driveId, 2, { index: 1 });
      await processorManager.indexOperations([updateOp]);

      expect(processor.receivedOperations).toHaveLength(2);
    });

    it("should update ViewState after processing", async () => {
      const driveId = generateId();
      const operations: OperationWithContext[] = [
        makeDriveCreateOp(driveId, 42),
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

  describe("Per-Processor Consistency", () => {
    it("should persist cursor per processor", async () => {
      const driveId = generateId();
      const { factory } = createMockProcessorFactory();
      await processorManager.registerFactory("test-factory", factory);

      await processorManager.indexOperations([makeDriveCreateOp(driveId, 1)]);
      await processorManager.indexOperations([makeOp(driveId, 5)]);

      const cursors = await db
        .selectFrom("ProcessorCursor")
        .selectAll()
        .execute();

      expect(cursors).toHaveLength(1);
      expect(cursors[0]!.processorId).toBe(`test-factory:${driveId}:0`);
      expect(cursors[0]!.lastOrdinal).toBe(5);
      expect(cursors[0]!.status).toBe("active");
    });

    it("should freeze cursor on error", async () => {
      const driveId = generateId();
      const badProcessor = createMockProcessor();
      let callCount = 0;
      badProcessor.onOperations = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount >= 2) {
          return Promise.reject(new Error("Processor failure"));
        }
        return Promise.resolve();
      });

      const factory: ProcessorFactory = () => [
        { processor: badProcessor, filter: {} },
      ];
      await processorManager.registerFactory("bad-factory", factory);

      await processorManager.indexOperations([makeDriveCreateOp(driveId, 1)]);
      await processorManager.indexOperations([makeOp(driveId, 5)]);

      const tracked = processorManager.get(`bad-factory:${driveId}:0`);
      expect(tracked).toBeDefined();
      expect(tracked!.status).toBe("errored");
      expect(tracked!.lastOrdinal).toBe(1);
      expect(tracked!.lastError).toBe("Processor failure");

      const cursor = await db
        .selectFrom("ProcessorCursor")
        .selectAll()
        .where("processorId", "=", `bad-factory:${driveId}:0`)
        .executeTakeFirst();

      expect(cursor!.lastOrdinal).toBe(1);
      expect(cursor!.status).toBe("errored");
    });

    it("should not affect other processors when one errors", async () => {
      const driveId = generateId();

      const goodProcessor = createMockProcessor();
      const badProcessor = createMockProcessor();
      let callCount = 0;
      badProcessor.onOperations = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount >= 2) {
          return Promise.reject(new Error("Processor failure"));
        }
        return Promise.resolve();
      });

      const goodFactory: ProcessorFactory = () => [
        { processor: goodProcessor, filter: {} },
      ];
      const badFactory: ProcessorFactory = () => [
        { processor: badProcessor, filter: {} },
      ];

      await processorManager.registerFactory("good-factory", goodFactory);
      await processorManager.registerFactory("bad-factory", badFactory);

      await processorManager.indexOperations([makeDriveCreateOp(driveId, 1)]);
      await processorManager.indexOperations([makeOp(driveId, 5)]);

      const good = processorManager.get(`good-factory:${driveId}:0`);
      const bad = processorManager.get(`bad-factory:${driveId}:0`);

      expect(good!.status).toBe("active");
      expect(good!.lastOrdinal).toBe(5);
      expect(bad!.status).toBe("errored");
      expect(bad!.lastOrdinal).toBe(1);
    });

    it("should backfill on late registration", async () => {
      const driveId = generateId();

      // Insert a drive snapshot so the PM knows the drive exists
      await db
        .insertInto("DocumentSnapshot")
        .values({
          id: generateId(),
          documentId: driveId,
          slug: "test-drive",
          name: "Test Drive",
          scope: "global",
          branch: "main",
          content: JSON.stringify({}),
          documentType: DRIVE_DOCUMENT_TYPE,
          lastOperationIndex: 0,
          lastOperationHash: "hash-0",
          identifiers: JSON.stringify({}),
          metadata: JSON.stringify({}),
        })
        .execute();

      // Write operations to the operation index so backfill can find them
      const ops = [
        makeDriveCreateOp(driveId, 1),
        makeOp(driveId, 2),
        makeOp(driveId, 3),
      ];
      await writeToOperationIndex(operationIndex, ops);

      // Index operations to advance the PM cursor
      await processorManager.indexOperations([ops[0]!]);
      await processorManager.indexOperations([ops[1]!]);
      await processorManager.indexOperations([ops[2]!]);

      // Now register a factory late — it should get backfilled
      const { factory, processor } = createMockProcessorFactory();
      await processorManager.registerFactory("late-factory", factory);

      // The processor should have received backfill ops
      expect(processor.receivedOperations.length).toBeGreaterThan(0);

      const tracked = processorManager.get(`late-factory:${driveId}:0`);
      expect(tracked).toBeDefined();
      expect(tracked!.lastOrdinal).toBe(3);
    });

    it("should retry after error", async () => {
      const driveId = generateId();
      const processor = createMockProcessor();
      let shouldFail = true;
      processor.onOperations = vi.fn().mockImplementation((ops) => {
        if (shouldFail) {
          shouldFail = false;
          return Promise.reject(new Error("Transient error"));
        }
        processor.receivedOperations.push(...ops);
        return Promise.resolve();
      });

      const factory: ProcessorFactory = () => [{ processor, filter: {} }];
      await processorManager.registerFactory("retry-factory", factory);

      // Write to operation index so retry/backfill can find ops
      const op = makeDriveCreateOp(driveId, 1);
      await writeToOperationIndex(operationIndex, [op]);
      await processorManager.indexOperations([op]);

      const tracked = processorManager.get(`retry-factory:${driveId}:0`);
      expect(tracked!.status).toBe("errored");

      // Now retry
      await tracked!.retry();

      expect(tracked!.status).toBe("active");
      expect(processor.receivedOperations.length).toBeGreaterThan(0);
    });

    it("should restore cursors from DB on restart", async () => {
      const driveId = generateId();

      // Insert drive snapshot
      await db
        .insertInto("DocumentSnapshot")
        .values({
          id: generateId(),
          documentId: driveId,
          slug: "test-drive",
          name: "Test Drive",
          scope: "global",
          branch: "main",
          content: JSON.stringify({}),
          documentType: DRIVE_DOCUMENT_TYPE,
          lastOperationIndex: 0,
          lastOperationHash: "hash-0",
          identifiers: JSON.stringify({}),
          metadata: JSON.stringify({}),
        })
        .execute();

      const { factory } = createMockProcessorFactory();
      await processorManager.registerFactory("test-factory", factory);

      await processorManager.indexOperations([makeDriveCreateOp(driveId, 1)]);
      await processorManager.indexOperations([makeOp(driveId, 10)]);

      // Verify cursor was persisted
      const cursor = await db
        .selectFrom("ProcessorCursor")
        .selectAll()
        .where("processorId", "=", `test-factory:${driveId}:0`)
        .executeTakeFirst();
      expect(cursor!.lastOrdinal).toBe(10);

      // Create a fresh ProcessorManager (simulates restart)
      const consistencyTracker = new ConsistencyTracker();
      const logger = new ConsoleLogger(["test"]);
      const restartedManager = new ProcessorManager(
        db as unknown as Kysely<DocumentViewDatabase>,
        operationIndex,
        mockWriteCache,
        consistencyTracker,
        logger,
      );
      await restartedManager.init();

      // Re-register the factory
      const { factory: factory2, processor: processor2 } =
        createMockProcessorFactory();
      await restartedManager.registerFactory("test-factory", factory2);

      // The restored cursor should be at 10
      const restored = restartedManager.get(`test-factory:${driveId}:0`);
      expect(restored).toBeDefined();
      expect(restored!.lastOrdinal).toBe(10);

      // The processor should NOT have received backfill since cursor is up-to-date
      expect(processor2.receivedOperations).toHaveLength(0);
    });

    it("should support startFrom 'current'", async () => {
      const driveId = generateId();

      // Insert drive snapshot
      await db
        .insertInto("DocumentSnapshot")
        .values({
          id: generateId(),
          documentId: driveId,
          slug: "test-drive",
          name: "Test Drive",
          scope: "global",
          branch: "main",
          content: JSON.stringify({}),
          documentType: DRIVE_DOCUMENT_TYPE,
          lastOperationIndex: 0,
          lastOperationHash: "hash-0",
          identifiers: JSON.stringify({}),
          metadata: JSON.stringify({}),
        })
        .execute();

      // Index ops to advance PM cursor
      await processorManager.indexOperations([makeDriveCreateOp(driveId, 1)]);
      await processorManager.indexOperations([makeOp(driveId, 5)]);

      // Register factory with startFrom: "current"
      const processor = createMockProcessor();
      const factory: ProcessorFactory = () => [
        { processor, filter: {}, startFrom: "current" },
      ];
      await processorManager.registerFactory("current-factory", factory);

      // Processor should NOT have been backfilled (cursor starts at PM's current ordinal)
      expect(processor.receivedOperations).toHaveLength(0);

      const tracked = processorManager.get(`current-factory:${driveId}:0`);
      expect(tracked).toBeDefined();
      expect(tracked!.lastOrdinal).toBe(5);
    });

    it("should delete cursors on drive cleanup", async () => {
      const driveId = generateId();
      const { factory } = createMockProcessorFactory();
      await processorManager.registerFactory("test-factory", factory);

      await processorManager.indexOperations([makeDriveCreateOp(driveId, 1)]);

      let cursors = await db
        .selectFrom("ProcessorCursor")
        .selectAll()
        .where("driveId", "=", driveId)
        .execute();
      expect(cursors.length).toBeGreaterThan(0);

      // Simulate drive deletion
      const deleteOp: OperationWithContext = {
        operation: {
          id: generateId(),
          index: 1,
          skip: 0,
          hash: "hash-delete",
          timestampUtcMs: new Date().toISOString(),
          action: {
            id: generateId(),
            type: "DELETE_DOCUMENT",
            scope: "document",
            timestampUtcMs: new Date().toISOString(),
            input: { documentId: driveId },
          },
        },
        context: {
          documentId: driveId,
          documentType: DRIVE_DOCUMENT_TYPE,
          scope: "document",
          branch: "main",
          ordinal: 2,
          resultingState: JSON.stringify({}),
        },
      };

      await processorManager.indexOperations([deleteOp]);

      cursors = await db
        .selectFrom("ProcessorCursor")
        .selectAll()
        .where("driveId", "=", driveId)
        .execute();
      expect(cursors).toHaveLength(0);
    });

    it("should no-op when retrying an active processor", async () => {
      const driveId = generateId();
      const processor = createMockProcessor();

      const factory: ProcessorFactory = () => [{ processor, filter: {} }];
      await processorManager.registerFactory("retry-factory", factory);

      const op = makeDriveCreateOp(driveId, 1);
      await writeToOperationIndex(operationIndex, [op]);
      await processorManager.indexOperations([op]);

      const tracked = processorManager.get(`retry-factory:${driveId}:0`);
      expect(tracked!.status).toBe("active");

      const callCountBefore = processor.receivedOperations.length;

      await tracked!.retry();

      expect(tracked!.status).toBe("active");
      expect(processor.receivedOperations.length).toBe(callCountBefore);
    });

    it("should continue processing when cursor persist fails", async () => {
      const driveId = generateId();

      const goodProcessor = createMockProcessor();
      const goodFactory: ProcessorFactory = () => [
        { processor: goodProcessor, filter: {} },
      ];
      await processorManager.registerFactory("good-factory", goodFactory);

      await processorManager.indexOperations([makeDriveCreateOp(driveId, 1)]);

      // Drop the ProcessorCursor table to force persist failures
      await db.schema.dropTable("ProcessorCursor").execute();
      await db.schema
        .createTable("ProcessorCursor")
        .addColumn("processorId", "text", (col) => col.primaryKey())
        .addColumn("factoryId", "text", (col) => col.notNull())
        .addColumn("driveId", "text", (col) => col.notNull())
        .addColumn("processorIndex", "integer", (col) => col.notNull())
        .addColumn("lastOrdinal", "integer", (col) => col.notNull())
        .addColumn("status", "text", (col) => col.notNull())
        .addColumn("lastError", "text")
        .addColumn("lastErrorTimestamp", "timestamptz")
        .addColumn("createdAt", "timestamptz", (col) =>
          col.notNull().defaultTo("now()"),
        )
        .addColumn("updatedAt", "timestamptz", (col) =>
          col.notNull().defaultTo("now()"),
        )
        .execute();

      // Make the table read-only by adding a trigger that rejects inserts
      await sql
        .raw(
          `CREATE FUNCTION reject_insert() RETURNS trigger AS $$
           BEGIN RAISE EXCEPTION 'insert rejected'; END;
           $$ LANGUAGE plpgsql`,
        )
        .execute(db);
      await sql
        .raw(
          `CREATE TRIGGER no_insert BEFORE INSERT ON "${REACTOR_SCHEMA}"."ProcessorCursor"
           FOR EACH ROW EXECUTE FUNCTION reject_insert()`,
        )
        .execute(db);

      // Route more operations — safeSaveProcessorCursor should catch the error
      const op2 = makeOp(driveId, 5);
      await processorManager.indexOperations([op2]);

      // The processor should still have received operations
      expect(goodProcessor.receivedOperations.length).toBeGreaterThan(0);

      // The PM's ViewState cursor should still advance
      const viewState = await db
        .selectFrom("ViewState")
        .selectAll()
        .where("readModelId", "=", "processor-manager")
        .executeTakeFirst();
      expect(viewState?.lastOrdinal).toBe(5);
    });

    it("should clean up orphaned cursor rows when factory returns fewer processors", async () => {
      const driveId = generateId();

      // Insert drive snapshot
      await db
        .insertInto("DocumentSnapshot")
        .values({
          id: generateId(),
          documentId: driveId,
          slug: "test-drive",
          name: "Test Drive",
          scope: "global",
          branch: "main",
          content: JSON.stringify({}),
          documentType: DRIVE_DOCUMENT_TYPE,
          lastOperationIndex: 0,
          lastOperationHash: "hash-0",
          identifiers: JSON.stringify({}),
          metadata: JSON.stringify({}),
        })
        .execute();

      // Register a factory that returns 3 processors
      const processors = [
        createMockProcessor(),
        createMockProcessor(),
        createMockProcessor(),
      ];
      const factory3: ProcessorFactory = () =>
        processors.map((p) => ({ processor: p, filter: {} }));
      await processorManager.registerFactory("shrink-factory", factory3);

      await processorManager.indexOperations([makeDriveCreateOp(driveId, 1)]);

      // Verify all 3 cursor rows exist
      let cursors = await db
        .selectFrom("ProcessorCursor")
        .selectAll()
        .where("factoryId", "=", "shrink-factory")
        .where("driveId", "=", driveId)
        .execute();
      expect(cursors).toHaveLength(3);

      // Re-register factory returning only 1 processor
      const singleProcessor = createMockProcessor();
      const factory1: ProcessorFactory = () => [
        { processor: singleProcessor, filter: {} },
      ];
      await processorManager.registerFactory("shrink-factory", factory1);

      // Orphaned rows for indices 1 and 2 should be gone
      cursors = await db
        .selectFrom("ProcessorCursor")
        .selectAll()
        .where("factoryId", "=", "shrink-factory")
        .where("driveId", "=", driveId)
        .execute();
      expect(cursors).toHaveLength(1);
      expect(cursors[0]!.processorIndex).toBe(0);
    });

    it("should skip errored processor on subsequent batches", async () => {
      const driveId = generateId();
      const processor = createMockProcessor();
      let callCount = 0;
      processor.onOperations = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error("First call fails"));
        }
        return Promise.resolve();
      });

      const factory: ProcessorFactory = () => [{ processor, filter: {} }];
      await processorManager.registerFactory("fail-factory", factory);

      // First batch: processor errors
      await processorManager.indexOperations([makeDriveCreateOp(driveId, 1)]);

      const tracked = processorManager.get(`fail-factory:${driveId}:0`);
      expect(tracked!.status).toBe("errored");

      // Second batch: processor should be skipped
      await processorManager.indexOperations([makeOp(driveId, 2)]);

      // onOperations should only have been called once (the failing first call)
      expect(processor.onOperations).toHaveBeenCalledTimes(1);
    });
  });
});
