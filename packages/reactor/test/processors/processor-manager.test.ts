import { PGlite } from "@electric-sql/pglite";
import {
  driveDocumentModelModule,
  setDriveName,
} from "@powerhousedao/shared/document-drive";
import {
  generateId,
  withSignaturePolicy,
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
import { DEFAULT_DRIVE_CONTAINER_TYPES } from "../../src/core/drive-container-types.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { Database, InProcessReactorModule } from "../../src/core/types.js";
import type { ReadModelIndexedEvent } from "../../src/events/types.js";
import { ReactorEventTypes } from "../../src/events/types.js";
import { ProcessorManager } from "../../src/processors/processor-manager.js";
import type { DocumentViewDatabase } from "../../src/read-models/types.js";
import { ConsistencyTracker } from "../../src/shared/consistency-tracker.js";
import type { PagedResults } from "../../src/shared/types.js";
import { JobStatus } from "../../src/shared/types.js";
import type { Database as StorageDatabase } from "../../src/storage/kysely/types.js";
import {
  REACTOR_SCHEMA,
  runMigrations,
} from "../../src/storage/migrations/migrator.js";
import { deferred } from "../factories.js";

const DRIVE_DOCUMENT_TYPE = "powerhouse/document-drive";

type CombinedDatabase = StorageDatabase & DocumentViewDatabase;

// IReactor.execute takes no signer, so its writes go unsigned.
function createLegacyDrive() {
  return withSignaturePolicy(
    driveDocumentModelModule.utils.createDocument(),
    "legacy",
  );
}

function createMockProcessor(namespace?: string): IProcessor & {
  receivedOperations: OperationWithContext[];
  disconnected: boolean;
} {
  const processor = {
    // Mirrors RelationalDbProcessor, whose namespace keys derived cursor ids.
    ...(namespace ? { namespace } : {}),
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
        input: {
          protocolVersions: { "base-reducer": 2 },
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
      ordinal,
      resultingState: JSON.stringify({
        header: {
          protocolVersions: { "base-reducer": 2 },
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

// Flags a routing section entered while another is on the stack, or one that
// hands back a promise instead of finishing synchronously.
class GuardedProcessorManager extends ProcessorManager {
  violations: string[] = [];
  private depth = 0;

  private guard<T>(name: string, section: () => T): T {
    if (this.depth > 0) this.violations.push(`${name} nested`);
    this.depth++;
    try {
      const result = section();
      if (result instanceof Promise) this.violations.push(`${name} async`);
      return result;
    } finally {
      this.depth--;
    }
  }

  protected override detectNewDrives(
    ...args: Parameters<ProcessorManager["detectNewDrives"]>
  ) {
    return this.guard("detectNewDrives", () => super.detectNewDrives(...args));
  }

  protected override detectDeletedDrives(
    ...args: Parameters<ProcessorManager["detectDeletedDrives"]>
  ) {
    return this.guard("detectDeletedDrives", () =>
      super.detectDeletedDrives(...args),
    );
  }

  protected override enqueueRouted(
    ...args: Parameters<ProcessorManager["enqueueRouted"]>
  ) {
    return this.guard("enqueueRouted", () => super.enqueueRouted(...args));
  }

  protected override bind(...args: Parameters<ProcessorManager["bind"]>) {
    return this.guard("bind", () => super.bind(...args));
  }

  protected override removeFactory(
    ...args: Parameters<ProcessorManager["removeFactory"]>
  ) {
    return this.guard("removeFactory", () => super.removeFactory(...args));
  }
}

function makeDriveDeleteOp(
  driveId: string,
  ordinal: number,
): OperationWithContext {
  return {
    operation: {
      id: generateId(),
      index: 1,
      skip: 0,
      hash: `hash-${ordinal}`,
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
      ordinal,
      resultingState: JSON.stringify({}),
    },
  };
}

class HookedProcessorManager extends ProcessorManager {
  afterCommit: (items: OperationWithContext[]) => Promise<void> = () =>
    Promise.resolve();

  protected override async commitOperations(
    items: OperationWithContext[],
  ): Promise<void> {
    await super.commitOperations(items);
    // Outside any transaction: PGlite is single-connection, so a hold inside
    // one would deadlock the other pass.
    await this.afterCommit(items);
  }
}

function ordinalsOf(processor: {
  receivedOperations: OperationWithContext[];
}): number[] {
  return processor.receivedOperations
    .map((op) => op.context.ordinal)
    .sort((a, b) => a - b);
}

// What `reactor.create` plus a first edit commits: creation in scope
// `document`, the edit in scope `global`.
function driveCreationOps(driveId: string): OperationWithContext[] {
  return [
    makeDriveCreateOp(driveId, 1),
    makeOp(driveId, 2, {
      actionType: "UPGRADE_DOCUMENT",
      scope: "document",
      index: 1,
    }),
    makeOp(driveId, 3, { index: 0 }),
  ];
}

async function insertDriveSnapshot(
  db: Kysely<CombinedDatabase>,
  driveId: string,
): Promise<void> {
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
}

describe("ProcessorManager Integration Tests", () => {
  let reactorModule: InProcessReactorModule;

  beforeEach(async () => {
    reactorModule = await new ReactorBuilder()
      .withDocumentModelSources([
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

      const driveDoc = createLegacyDrive();

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

      const driveDoc = createLegacyDrive();
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

  // The call patterns of the hosts: Connect's boot, reactor-api's package
  // reload, and the openpanel teardown guard.
  describe("registerFactory as hosts call it", () => {
    async function waitForJob(jobId: string): Promise<void> {
      await vi.waitFor(
        async () => {
          const status = await reactorModule.reactor.getJobStatus(jobId);
          if (status.status === JobStatus.FAILED) {
            throw new Error(`Job failed: ${status.error?.message}`);
          }
          expect(status.status).toBe(JobStatus.READ_READY);
        },
        { timeout: 5000 },
      );
    }

    async function rename(driveId: string, name: string): Promise<void> {
      const job = await reactorModule.reactor.execute(driveId, "main", [
        setDriveName({ name }),
      ]);
      await waitForJob(job.id);
    }

    async function driveWithHistory(renames: number): Promise<string> {
      const driveDoc = createLegacyDrive();
      const created = await reactorModule.reactor.create(driveDoc);
      await waitForJob(created.id);
      for (let i = 0; i < renames; i++) {
        await rename(driveDoc.header.id, `name-${i}`);
      }
      return driveDoc.header.id;
    }

    async function allOrdinals(): Promise<number[]> {
      const ordinals: number[] = [];
      let page = await reactorModule.operationIndex.getSinceOrdinal(0);
      for (;;) {
        ordinals.push(...page.results.map((op) => op.context.ordinal));
        if (!page.next) break;
        page = await page.next();
      }
      return ordinals.sort((a, b) => a - b);
    }

    function trackedFor(processor: IProcessor) {
      return reactorModule.processorManager
        .getAll()
        .find((t) => t.record.processor === processor);
    }

    it("should bind every package registered concurrently and backfill each once", async () => {
      const driveId = await driveWithHistory(3);
      const expected = await allOrdinals();

      const packages = ["pkg-a", "pkg-b", "pkg-c"].map((id) => ({
        id,
        ...createMockProcessorFactory(),
      }));
      await Promise.all(
        packages.map(({ id, factory }) =>
          reactorModule.processorManager.registerFactory(id, factory),
        ),
      );

      // Bound on resolve; the backfill is not part of the promise.
      for (const { id, processor } of packages) {
        const tracked = reactorModule.processorManager.get(
          `${id}:${driveId}:0`,
        );
        expect(tracked?.record.processor).toBe(processor);
      }
      for (const { processor } of packages) {
        await vi.waitFor(() =>
          expect(trackedFor(processor)?.lastOrdinal).toBe(expected.at(-1)),
        );
        expect(ordinalsOf(processor)).toEqual(expected);
      }
    });

    it("should hand a reloaded package over without overlap while writes continue", async () => {
      const driveId = await driveWithHistory(2);
      const events: string[] = [];
      const held = deferred();
      const release = deferred();

      // The old instance is mid-delivery when the reload starts.
      const before = createMockProcessor();
      before.onOperations = vi
        .fn()
        .mockImplementation(async (ops: OperationWithContext[]) => {
          const renamed = ops.some(
            (op) =>
              (op.operation.action.input as { name?: string }).name === "held",
          );
          if (renamed) {
            held.resolve();
            await release.promise;
            events.push("old delivery done");
          }
        });
      before.onDisconnect = vi.fn().mockImplementation(() => {
        events.push("old disconnect");
        return Promise.resolve();
      });
      await reactorModule.processorManager.registerFactory("pkg", () => [
        { processor: before, filter: {} },
      ]);
      await vi.waitFor(() =>
        expect(trackedFor(before)?.lastOrdinal).toBeGreaterThan(0),
      );

      const heldWrite = rename(driveId, "held");
      await held.promise;

      const after = createMockProcessor();
      await reactorModule.processorManager.unregisterFactory("pkg");
      const reload = reactorModule.processorManager.registerFactory(
        "pkg",
        () => {
          events.push("new factory");
          return [{ processor: after, filter: {} }];
        },
      );
      const writes = (async () => {
        for (let i = 0; i < 2; i++) await rename(driveId, `during-${i}`);
      })();
      // A round trip on the idle connection: time for the new factory to run
      // if nothing held it back.
      await reactorModule.operationIndex.getSinceOrdinal(0);
      release.resolve();
      await Promise.all([heldWrite, reload, writes]);
      await rename(driveId, "after");

      const expected = await allOrdinals();
      await vi.waitFor(() =>
        expect(trackedFor(after)?.lastOrdinal).toBe(expected.at(-1)),
      );

      expect(events).toEqual([
        "old delivery done",
        "old disconnect",
        "new factory",
      ]);
      expect(trackedFor(before)).toBeUndefined();
      // The cursor went with the old registration: one full replay.
      expect(ordinalsOf(after)).toEqual(expected);
    });

    it("should leave nothing behind when unregistered while registration is in flight", async () => {
      const driveId = await driveWithHistory(1);
      const processor = createMockProcessor();
      const factoryEntered = deferred();
      const releaseFactory = deferred();

      const registration = reactorModule.processorManager.registerFactory(
        "openpanel",
        async () => {
          factoryEntered.resolve();
          await releaseFactory.promise;
          return [{ processor, filter: {} }];
        },
      );
      await factoryEntered.promise;
      const teardown =
        reactorModule.processorManager.unregisterFactory("openpanel");
      releaseFactory.resolve();
      await Promise.all([registration, teardown]);

      await rename(driveId, "after teardown");

      expect(
        reactorModule.processorManager
          .getAll()
          .filter((t) => t.factoryId === "openpanel"),
      ).toEqual([]);
      expect(processor.onDisconnect).toHaveBeenCalledTimes(1);
      expect(processor.receivedOperations).toEqual([]);
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

      const driveDoc = createLegacyDrive();
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

      const driveDoc = createLegacyDrive();
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

      const driveDoc = createLegacyDrive();
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

      const driveDoc = createLegacyDrive();
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

      const driveDoc = createLegacyDrive();
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
      const driveDoc = createLegacyDrive();
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

      const driveDoc = createLegacyDrive();
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

      const driveDoc = createLegacyDrive();
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

      const driveDoc = createLegacyDrive();
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

      const driveDoc = createLegacyDrive();
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
      const driveDoc = createLegacyDrive();

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

      const driveDoc = createLegacyDrive();
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

      const driveDoc = createLegacyDrive();
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

  describe("Concurrent read-model batches", () => {
    // Guards the fix; the standalone tests below demonstrate the defects. A
    // drive's creation (scope document) and its first edit (scope global)
    // project on different coordinator keys, so the manager indexes them as
    // two batches in either order.
    it("should deliver a drive's first edit once and leave both cursors at the highest ordinal", async () => {
      const indexed: ReadModelIndexedEvent[] = [];
      reactorModule.eventBus.subscribe<ReadModelIndexedEvent>(
        ReactorEventTypes.READMODEL_INDEXED,
        (_type, event) => {
          indexed.push(event);
        },
      );
      const managerIndexed = (jobId: string) =>
        indexed.some(
          (e) =>
            e.jobId === jobId &&
            e.readModelName === "processor-manager" &&
            e.success,
        );

      const { factory, processor } = createMockProcessorFactory({
        documentType: [DRIVE_DOCUMENT_TYPE],
      });
      await reactorModule.processorManager.registerFactory(
        "test-factory",
        factory,
      );

      const driveDoc = createLegacyDrive();
      const driveId = driveDoc.header.id;
      const createJob = await reactorModule.reactor.create(driveDoc);
      // The queue does not hold a global-scope job behind the same document's
      // pending creation; the manager race is downstream of READ_READY anyway.
      await vi.waitFor(async () => {
        const status = await reactorModule.reactor.getJobStatus(createJob.id);
        expect(status.status).toBe(JobStatus.READ_READY);
      });

      const editJob = await reactorModule.reactor.execute(driveId, "main", [
        setDriveName({ name: "renamed" }),
      ]);

      await vi.waitFor(() => {
        expect(managerIndexed(createJob.id)).toBe(true);
        expect(managerIndexed(editJob.id)).toBe(true);
      });

      const renames = processor.receivedOperations.filter(
        (op) => op.operation.action.type === "SET_DRIVE_NAME",
      );
      expect(renames).toHaveLength(1);

      const all = await reactorModule.operationIndex.getSinceOrdinal(0);
      const maxOrdinal = Math.max(
        ...all.results.map((op) => op.context.ordinal),
      );
      expect(maxOrdinal).toBeGreaterThan(0);

      const db = reactorModule.database as unknown as Kysely<CombinedDatabase>;
      const cursor = await db
        .selectFrom("ProcessorCursor")
        .select("lastOrdinal")
        .where("processorId", "=", `test-factory:${driveId}:0`)
        .executeTakeFirst();
      expect(cursor?.lastOrdinal).toBe(maxOrdinal);

      await reactorModule.catchUp.sweepNow();
      const viewState = await db
        .selectFrom("ViewState")
        .select("lastOrdinal")
        .where("readModelId", "=", "processor-manager")
        .executeTakeFirst();
      expect(viewState?.lastOrdinal).toBe(maxOrdinal);
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
      putRun: vi.fn(),
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
      DEFAULT_DRIVE_CONTAINER_TYPES,
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

      await insertDriveSnapshot(db, driveId);

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
        DEFAULT_DRIVE_CONTAINER_TYPES,
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

    it("should discover drives of all configured container types", async () => {
      const legacyDriveId = generateId();
      const reactorDriveId = generateId();

      await db
        .insertInto("DocumentSnapshot")
        .values([
          {
            id: generateId(),
            documentId: legacyDriveId,
            slug: "legacy",
            name: "Legacy Drive",
            scope: "global",
            branch: "main",
            content: JSON.stringify({}),
            documentType: "powerhouse/document-drive",
            lastOperationIndex: 0,
            lastOperationHash: "hash-0",
            identifiers: JSON.stringify({}),
            metadata: JSON.stringify({}),
          },
          {
            id: generateId(),
            documentId: reactorDriveId,
            slug: "reactor",
            name: "Reactor Drive",
            scope: "global",
            branch: "main",
            content: JSON.stringify({}),
            documentType: "powerhouse/reactor-drive",
            lastOperationIndex: 0,
            lastOperationHash: "hash-0",
            identifiers: JSON.stringify({}),
            metadata: JSON.stringify({}),
          },
        ])
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
        DEFAULT_DRIVE_CONTAINER_TYPES,
      );
      await restartedManager.init();

      const seenHeaders: PHDocumentHeader[] = [];
      const factory: ProcessorFactory = (header) => {
        seenHeaders.push(header);
        return [];
      };
      await restartedManager.registerFactory("test-factory", factory);

      expect(seenHeaders).toHaveLength(2);
      const headerMap = new Map(seenHeaders.map((h) => [h.id, h.documentType]));
      expect(headerMap.get(legacyDriveId)).toBe("powerhouse/document-drive");
      expect(headerMap.get(reactorDriveId)).toBe("powerhouse/reactor-drive");
    });

    it("should ignore documents whose type is outside the configured set", async () => {
      const driveId = generateId();
      const otherId = generateId();

      await db
        .insertInto("DocumentSnapshot")
        .values([
          {
            id: generateId(),
            documentId: driveId,
            slug: "drive",
            name: "Drive",
            scope: "global",
            branch: "main",
            content: JSON.stringify({}),
            documentType: "powerhouse/document-drive",
            lastOperationIndex: 0,
            lastOperationHash: "hash-0",
            identifiers: JSON.stringify({}),
            metadata: JSON.stringify({}),
          },
          {
            id: generateId(),
            documentId: otherId,
            slug: "other",
            name: "Other Doc",
            scope: "global",
            branch: "main",
            content: JSON.stringify({}),
            documentType: "powerhouse/document-model",
            lastOperationIndex: 0,
            lastOperationHash: "hash-0",
            identifiers: JSON.stringify({}),
            metadata: JSON.stringify({}),
          },
        ])
        .execute();

      const consistencyTracker = new ConsistencyTracker();
      const logger = new ConsoleLogger(["test"]);
      const restartedManager = new ProcessorManager(
        db as unknown as Kysely<DocumentViewDatabase>,
        operationIndex,
        mockWriteCache,
        consistencyTracker,
        logger,
        DEFAULT_DRIVE_CONTAINER_TYPES,
      );
      await restartedManager.init();

      const seenIds: string[] = [];
      const factory: ProcessorFactory = (header) => {
        seenIds.push(header.id);
        return [];
      };
      await restartedManager.registerFactory("test-factory", factory);

      expect(seenIds).toEqual([driveId]);
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

    it("leaves ViewState to the catch-up sweep", async () => {
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

      expect(viewState?.lastOrdinal).toBe(0);
    });
  });

  describe("Cursor ids", () => {
    it("should key cursors by array position by default", async () => {
      const driveId = generateId();
      const factory: ProcessorFactory = () => [
        { processor: createMockProcessor("company_list_v1"), filter: {} },
      ];
      await processorManager.registerFactory("pkg", factory);
      await processorManager.indexOperations([makeDriveCreateOp(driveId, 1)]);

      expect(processorManager.get(`pkg:${driveId}:0`)).toBeDefined();
    });

    it("should key cursors by derived slot when legacy ids are off", async () => {
      const manager = new ProcessorManager(
        db as unknown as Kysely<DocumentViewDatabase>,
        operationIndex,
        mockWriteCache,
        new ConsistencyTracker(),
        new ConsoleLogger(["test"]),
        DEFAULT_DRIVE_CONTAINER_TYPES,
        { legacyProcessorIds: false },
      );
      await manager.init();

      const driveId = generateId();
      const factory: ProcessorFactory = () => [
        { processor: createMockProcessor("company_list_v1"), filter: {} },
        { processor: createMockProcessor(), filter: {}, id: "explicit" },
        { processor: createMockProcessor(), filter: {} },
      ];
      await manager.registerFactory("pkg", factory);
      await manager.indexOperations([makeDriveCreateOp(driveId, 1)]);

      expect(
        manager
          .getAll()
          .map((t) => t.processorId)
          .sort(),
      ).toEqual([
        `pkg:${driveId}:2`,
        `pkg:${driveId}:company_list_v1`,
        `pkg:${driveId}:explicit`,
      ]);
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
      await insertDriveSnapshot(db, driveId);

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

      // Registration resolves once bound; the backfill runs on its queue.
      const tracked = processorManager.get(`late-factory:${driveId}:0`);
      expect(tracked).toBeDefined();
      await vi.waitFor(() => expect(tracked!.lastOrdinal).toBe(3));
      expect(ordinalsOf(processor)).toEqual([1, 2, 3]);
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
      await insertDriveSnapshot(db, driveId);

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
        DEFAULT_DRIVE_CONTAINER_TYPES,
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
      await insertDriveSnapshot(db, driveId);

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
    });

    it("should clean up orphaned cursor rows when factory returns fewer processors", async () => {
      const driveId = generateId();

      // Insert drive snapshot
      await insertDriveSnapshot(db, driveId);

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

  describe("Concurrent read-model batches", () => {
    // The coordinator chains projection per documentId:scope:branch, so a
    // drive's creation (scope document) and its first edit (scope global)
    // reach the manager as separate batches in either order.
    async function readCursors(processorId: string) {
      const cursor = await db
        .selectFrom("ProcessorCursor")
        .select("lastOrdinal")
        .where("processorId", "=", processorId)
        .executeTakeFirst();
      const viewState = await db
        .selectFrom("ViewState")
        .select("lastOrdinal")
        .where("readModelId", "=", "processor-manager")
        .executeTakeFirst();
      return { cursor, viewState };
    }

    it("should keep cursors at the highest ordinal when the edit arrives before the creation", async () => {
      const driveId = generateId();
      await insertDriveSnapshot(db, driveId);
      const { factory, processor } = createMockProcessorFactory({
        documentType: [DRIVE_DOCUMENT_TYPE],
      });
      await processorManager.registerFactory("f", factory);

      const ops = driveCreationOps(driveId);
      await writeToOperationIndex(operationIndex, ops);

      await processorManager.indexOperations([ops[2]!]);
      await processorManager.indexOperations([ops[0]!, ops[1]!]);

      expect(ordinalsOf(processor)).toEqual([1, 2, 3]);

      const tracked = processorManager.get(`f:${driveId}:0`);
      expect(tracked).toBeDefined();
      expect(tracked!.lastOrdinal).toBe(3);

      const { cursor } = await readCursors(`f:${driveId}:0`);
      expect(cursor?.lastOrdinal).toBe(3);

      // A restart backfills from the persisted cursors: op 3 must not repeat.
      const restarted = new ProcessorManager(
        db as unknown as Kysely<DocumentViewDatabase>,
        operationIndex,
        mockWriteCache,
        new ConsistencyTracker(),
        new ConsoleLogger(["test"]),
        DEFAULT_DRIVE_CONTAINER_TYPES,
      );
      await restarted.init();
      const { factory: factory2, processor: processor2 } =
        createMockProcessorFactory({ documentType: [DRIVE_DOCUMENT_TYPE] });
      await restarted.registerFactory("f", factory2);

      expect(ordinalsOf(processor2)).toEqual([]);
    });

    it("should deliver a drive's operations once when its edit's pass is mid-flight during creation", async () => {
      const pm = new HookedProcessorManager(
        db as unknown as Kysely<DocumentViewDatabase>,
        operationIndex,
        mockWriteCache,
        new ConsistencyTracker(),
        new ConsoleLogger(["test"]),
        DEFAULT_DRIVE_CONTAINER_TYPES,
      );
      await pm.init();

      const driveId = generateId();
      const mock = createMockProcessorFactory({
        documentType: [DRIVE_DOCUMENT_TYPE],
      });
      await pm.registerFactory("f", mock.factory);

      const ops = driveCreationOps(driveId);
      await writeToOperationIndex(operationIndex, ops);

      const editRouted = deferred();
      const release = deferred();
      pm.afterCommit = async (items) => {
        if (items[0]!.context.ordinal === 3) {
          editRouted.resolve();
          await release.promise;
        }
      };

      const edit = pm.indexOperations([ops[2]!]);
      await editRouted.promise;
      const creation = pm.indexOperations([ops[0]!, ops[1]!]);
      await creation;
      release.resolve();
      await edit;

      expect(ordinalsOf(mock.processor)).toEqual([1, 2, 3]);

      const { cursor } = await readCursors(`f:${driveId}:0`);
      expect(cursor?.lastOrdinal).toBe(3);
    });

    it("should deliver an earlier ordinal that arrives after a later one", async () => {
      const driveId = generateId();
      const { factory, processor } = createMockProcessorFactory({
        documentId: ["*"],
      });
      await processorManager.registerFactory("f", factory);

      await processorManager.indexOperations([makeDriveCreateOp(driveId, 1)]);

      // Child documents project on their own coordinator keys.
      await processorManager.indexOperations([
        makeOp(generateId(), 3, { documentType: "powerhouse/document-model" }),
      ]);
      await processorManager.indexOperations([
        makeOp(generateId(), 2, { documentType: "powerhouse/document-model" }),
      ]);

      expect(ordinalsOf(processor)).toContain(2);

      const tracked = processorManager.get(`f:${driveId}:0`);
      expect(tracked).toBeDefined();
      expect(tracked!.lastOrdinal).toBe(3);
    });

    it("should start a 'current' processor at its drive's creation when the edit arrived first", async () => {
      const driveId = generateId();
      const processor = createMockProcessor();
      const factory: ProcessorFactory = () => [
        {
          processor,
          filter: { documentType: [DRIVE_DOCUMENT_TYPE] },
          startFrom: "current",
        },
      ];
      await processorManager.registerFactory("current-factory", factory);

      const ops = driveCreationOps(driveId);
      await writeToOperationIndex(operationIndex, ops);

      await processorManager.indexOperations([ops[2]!]);
      await processorManager.indexOperations([ops[0]!, ops[1]!]);

      expect(ordinalsOf(processor)).toEqual([1, 2, 3]);
    });

    it("should not give a 'current' processor operations that predate its drive", async () => {
      const processor = createMockProcessor();
      const factory: ProcessorFactory = () => [
        { processor, filter: { documentId: ["*"] }, startFrom: "current" },
      ];
      await processorManager.registerFactory("current-factory", factory);

      const childId = generateId();
      const driveId = generateId();
      const ops = [
        makeOp(childId, 1, { documentType: "powerhouse/document-model" }),
        makeOp(childId, 2, { documentType: "powerhouse/document-model" }),
        makeOp(childId, 3, { documentType: "powerhouse/document-model" }),
        makeDriveCreateOp(driveId, 4),
      ];
      await writeToOperationIndex(operationIndex, ops);

      await processorManager.indexOperations([ops[0]!]);
      // The drive's creation reaches the manager before the child's 2 and 3.
      await processorManager.indexOperations([ops[3]!]);
      await processorManager.indexOperations([ops[1]!, ops[2]!]);

      expect(ordinalsOf(processor)).toEqual([4]);
    });
  });

  describe("Backfill outside the lock", () => {
    const CHILD = "powerhouse/document-model";

    // A processor that holds its first call until the test releases it.
    function holdingProcessor() {
      const held = deferred();
      const release = deferred();
      let calls = 0;
      const processor = createMockProcessor();
      processor.onOperations = vi
        .fn()
        .mockImplementation(async (ops: OperationWithContext[]) => {
          calls++;
          if (calls === 1) {
            held.resolve();
            await release.promise;
          }
          processor.receivedOperations.push(...ops);
        });
      return { processor, held, release };
    }

    it("should index other documents while a registration backfill is running", async () => {
      const driveId = generateId();
      await insertDriveSnapshot(db, driveId);
      const ops = [
        makeDriveCreateOp(driveId, 1),
        makeOp(generateId(), 2, { documentType: CHILD }),
        makeOp(generateId(), 3, { documentType: CHILD }),
      ];
      await writeToOperationIndex(operationIndex, ops);
      for (const op of ops) await processorManager.indexOperations([op]);

      const { processor, held, release } = holdingProcessor();
      const factory: ProcessorFactory = () => [
        { processor, filter: { documentId: ["*"] } },
      ];
      const registration = processorManager.registerFactory("late", factory);
      await held.promise;

      // Written after the backfill's page was read, so only live routing
      // can carry it.
      const live = makeOp(generateId(), 4, { documentType: CHILD });
      await writeToOperationIndex(operationIndex, [live]);
      await processorManager.indexOperations([live]);

      release.resolve();
      await registration;

      await vi.waitFor(() =>
        expect(ordinalsOf(processor)).toEqual([1, 2, 3, 4]),
      );
    });

    it("should neither lose nor repeat a live batch that arrives mid-backfill", async () => {
      const driveId = generateId();
      await insertDriveSnapshot(db, driveId);
      const ops = [
        makeDriveCreateOp(driveId, 1),
        makeOp(generateId(), 2, { documentType: CHILD }),
        makeOp(generateId(), 3, { documentType: CHILD }),
      ];
      await writeToOperationIndex(operationIndex, ops);
      for (const op of ops.slice(0, 2)) {
        await processorManager.indexOperations([op]);
      }

      const { processor, held, release } = holdingProcessor();
      const factory: ProcessorFactory = () => [
        { processor, filter: { documentId: ["*"] } },
      ];
      const registration = processorManager.registerFactory("late", factory);
      await held.promise;

      // Op 3 is in the index, so the backfill page already holds it; the
      // live batch for it lands while the backfill is still delivering.
      await processorManager.indexOperations([ops[2]!]);

      release.resolve();
      await registration;

      const tracked = processorManager.get(`late:${driveId}:0`);
      await vi.waitFor(() => expect(tracked!.lastOrdinal).toBe(3));
      await db.selectFrom("ViewState").select("lastOrdinal").execute();
      expect(ordinalsOf(processor)).toEqual([1, 2, 3]);
    });
  });

  describe("Reentrant calls", () => {
    it("should accept a registration made from inside a delivery", async () => {
      const driveId = generateId();
      const reentrant = createMockProcessor();
      const nested = createMockProcessorFactory({ documentId: ["*"] });
      let registered: Promise<void> | undefined;
      reentrant.onOperations = vi
        .fn()
        .mockImplementation(
          () =>
            (registered ??= processorManager.registerFactory(
              "nested",
              nested.factory,
            )),
        );
      const factory: ProcessorFactory = () => [
        { processor: reentrant, filter: { documentId: ["*"] } },
      ];
      await processorManager.registerFactory("outer", factory);

      const ops = [makeDriveCreateOp(driveId, 1), makeOp(driveId, 2)];
      await writeToOperationIndex(operationIndex, ops);
      await processorManager.indexOperations([ops[0]!]);

      const tracked = processorManager.get(`outer:${driveId}:0`);
      expect(tracked!.status).toBe("active");
      const inner = processorManager.get(`nested:${driveId}:0`);
      expect(inner).toBeDefined();

      const later = createMockProcessorFactory({ documentId: ["*"] });
      await processorManager.registerFactory("later", later.factory);
      await processorManager.indexOperations([ops[1]!]);
      await vi.waitFor(() =>
        expect(processorManager.get(`later:${driveId}:0`)!.lastOrdinal).toBe(2),
      );
      expect(ordinalsOf(later.processor)).toEqual([1, 2]);
      expect(ordinalsOf(nested.processor)).toEqual([1, 2]);
    });
  });

  describe("Failed and skipped live batches", () => {
    // lastOrdinal is a cross-document high-water mark, so a lower ordinal
    // that fails or is skipped must pull the cursor back below itself or
    // retry and restart both resume past it.
    const CHILD = "powerhouse/document-model";

    function failingOn(ordinal: number) {
      const processor = createMockProcessor();
      processor.onOperations = vi
        .fn()
        .mockImplementation((ops: OperationWithContext[]) => {
          if (ops.some((op) => op.context.ordinal === ordinal)) {
            return Promise.reject(new Error(`fails on ${ordinal}`));
          }
          processor.receivedOperations.push(...ops);
          return Promise.resolve();
        });
      return processor;
    }

    it("should retry a batch that failed below the cursor", async () => {
      const driveId = generateId();
      const processor = failingOn(2);
      const factory: ProcessorFactory = () => [
        { processor, filter: { documentId: ["*"] } },
      ];
      await processorManager.registerFactory("f", factory);

      const ops = [
        makeDriveCreateOp(driveId, 1),
        makeOp(generateId(), 2, { documentType: CHILD }),
        makeOp(generateId(), 3, { documentType: CHILD }),
      ];
      await writeToOperationIndex(operationIndex, ops);

      await processorManager.indexOperations([ops[0]!]);
      await processorManager.indexOperations([ops[2]!]);
      await processorManager.indexOperations([ops[1]!]);

      const tracked = processorManager.get(`f:${driveId}:0`);
      expect(tracked).toBeDefined();
      expect(tracked!.status).toBe("errored");
      expect(tracked!.lastOrdinal).toBe(1);

      const row = await db
        .selectFrom("ProcessorCursor")
        .select("lastOrdinal")
        .where("processorId", "=", `f:${driveId}:0`)
        .executeTakeFirst();
      expect(row?.lastOrdinal).toBe(1);

      processor.onOperations = vi
        .fn()
        .mockImplementation((batch: OperationWithContext[]) => {
          processor.receivedOperations.push(...batch);
          return Promise.resolve();
        });
      await tracked!.retry();

      expect(ordinalsOf(processor)).toContain(2);
    });

    it("should retry a batch skipped while the processor was errored", async () => {
      const driveId = generateId();
      const processor = failingOn(3);
      const factory: ProcessorFactory = () => [
        { processor, filter: { documentId: ["*"] } },
      ];
      await processorManager.registerFactory("f", factory);

      const ops = [
        makeDriveCreateOp(driveId, 1),
        makeOp(generateId(), 2, { documentType: CHILD }),
        makeOp(generateId(), 3, { documentType: CHILD }),
        makeOp(generateId(), 4, { documentType: CHILD }),
      ];
      await writeToOperationIndex(operationIndex, ops);

      await processorManager.indexOperations([ops[0]!]);
      await processorManager.indexOperations([ops[3]!]);
      await processorManager.indexOperations([ops[2]!]);
      await processorManager.indexOperations([ops[1]!]);

      const tracked = processorManager.get(`f:${driveId}:0`);
      expect(tracked).toBeDefined();
      expect(tracked!.status).toBe("errored");
      expect(tracked!.lastOrdinal).toBe(1);

      processor.onOperations = vi
        .fn()
        .mockImplementation((batch: OperationWithContext[]) => {
          processor.receivedOperations.push(...batch);
          return Promise.resolve();
        });
      await tracked!.retry();

      expect(ordinalsOf(processor)).toContain(2);
      expect(ordinalsOf(processor)).toContain(3);
    });
  });

  describe("Delivery queues", () => {
    const CHILD = "powerhouse/document-model";

    function hookedManager(): HookedProcessorManager {
      return new HookedProcessorManager(
        db as unknown as Kysely<DocumentViewDatabase>,
        operationIndex,
        mockWriteCache,
        new ConsistencyTracker(),
        new ConsoleLogger(["test"]),
        DEFAULT_DRIVE_CONTAINER_TYPES,
      );
    }

    async function cursorRow(processorId: string) {
      return db
        .selectFrom("ProcessorCursor")
        .selectAll()
        .where("processorId", "=", processorId)
        .executeTakeFirst();
    }

    it("should keep every routing section synchronous and unnested", async () => {
      const pm = new GuardedProcessorManager(
        db as unknown as Kysely<DocumentViewDatabase>,
        operationIndex,
        mockWriteCache,
        new ConsistencyTracker(),
        new ConsoleLogger(["test"]),
        DEFAULT_DRIVE_CONTAINER_TYPES,
      );
      await pm.init();

      // Callbacks that call straight back into the manager, synchronously.
      const nested = createMockProcessorFactory({ documentId: ["*"] });
      const processor = createMockProcessor();
      processor.onOperations = vi.fn().mockImplementation(() => {
        void pm.registerFactory("nested", nested.factory);
        void pm.unregisterFactory("nested");
        return Promise.resolve();
      });
      const factory: ProcessorFactory = () => {
        void pm.unregisterFactory("absent");
        return [{ processor, filter: { documentId: ["*"] } }];
      };
      await pm.registerFactory("f", factory);

      const driveId = generateId();
      const ops = [
        makeDriveCreateOp(driveId, 1),
        makeOp(generateId(), 2, { documentType: CHILD }),
        makeOp(generateId(), 3, { documentType: CHILD }),
      ];
      await writeToOperationIndex(operationIndex, ops);

      await pm.indexOperations([ops[0]!]);
      await Promise.all(ops.slice(1).map((op) => pm.indexOperations([op])));
      await pm.registerFactory("f", factory);
      await pm.indexOperations([
        makeOp(generateId(), 5, { documentType: CHILD }),
      ]);
      await pm.indexOperations([makeDriveDeleteOp(driveId, 6)]);

      expect(pm.violations).toEqual([]);
      expect(processor.onOperations).toHaveBeenCalled();
    });

    it("should deliver a child created while its drive's factory runs exactly once", async () => {
      const pm = hookedManager();
      await pm.init();

      const driveId = generateId();
      const ops = [
        makeDriveCreateOp(driveId, 1),
        makeOp(generateId(), 2, {
          actionType: "CREATE_DOCUMENT",
          documentType: CHILD,
          scope: "document",
          index: 0,
        }),
      ];
      await writeToOperationIndex(operationIndex, ops);

      const processor = createMockProcessor();
      const factoryEntered = deferred();
      const releaseFactory = deferred();
      const factory: ProcessorFactory = async () => {
        factoryEntered.resolve();
        await releaseFactory.promise;
        return [{ processor, filter: { documentId: ["*"] } }];
      };
      await pm.registerFactory("f", factory);

      // The child's pass routes, then stalls before it saves its cursor.
      const childRouted = deferred();
      const releaseChild = deferred();
      pm.afterCommit = async (items) => {
        if (items[0]!.context.ordinal === 2) {
          childRouted.resolve();
          await releaseChild.promise;
        }
      };

      const creation = pm.indexOperations([ops[0]!]);
      await factoryEntered.promise;
      const child = pm.indexOperations([ops[1]!]);
      await childRouted.promise;
      releaseFactory.resolve();
      await creation;
      releaseChild.resolve();
      await child;

      expect(ordinalsOf(processor)).toEqual([1, 2]);
    });

    it("should let a processor unregister its own factory from inside onOperations", async () => {
      const driveId = generateId();
      const events: string[] = [];
      const processor = createMockProcessor();
      processor.onOperations = vi.fn().mockImplementation(async () => {
        events.push("ops");
        await processorManager.unregisterFactory("self");
        events.push("unregistered");
      });
      processor.onDisconnect = vi.fn().mockImplementation(() => {
        events.push("disconnect");
        return Promise.resolve();
      });
      const factory: ProcessorFactory = () => [
        { processor, filter: { documentId: ["*"] } },
      ];
      await processorManager.registerFactory("self", factory);

      await processorManager.indexOperations([makeDriveCreateOp(driveId, 1)]);

      await vi.waitFor(() =>
        expect(events).toEqual(["ops", "unregistered", "disconnect"]),
      );
      expect(processorManager.get(`self:${driveId}:0`)).toBeUndefined();
      expect(await cursorRow(`self:${driveId}:0`)).toBeUndefined();
    });

    it("should not resurrect a deleted drive's cursor from a delivery in flight", async () => {
      const driveId = generateId();
      const held = deferred();
      const release = deferred();
      const processor = createMockProcessor();
      processor.onOperations = vi
        .fn()
        .mockImplementation(async (ops: OperationWithContext[]) => {
          if (ops.some((op) => op.context.ordinal === 2)) {
            held.resolve();
            await release.promise;
          }
        });
      const factory: ProcessorFactory = () => [
        { processor, filter: { documentId: ["*"] } },
      ];
      await processorManager.registerFactory("f", factory);
      await processorManager.indexOperations([makeDriveCreateOp(driveId, 1)]);

      const child = processorManager.indexOperations([
        makeOp(generateId(), 2, { documentType: CHILD }),
      ]);
      await held.promise;
      const deletion = processorManager.indexOperations([
        makeDriveDeleteOp(driveId, 3),
      ]);
      // A round trip on the idle connection: time enough for the deletion
      // to reach the database.
      await db.selectFrom("ViewState").select("lastOrdinal").execute();
      release.resolve();
      await Promise.all([child, deletion]);
      await vi.waitFor(() => expect(processor.onDisconnect).toHaveBeenCalled());

      expect(await cursorRow(`f:${driveId}:0`)).toBeUndefined();
    });

    it("should not replay or persist when retrying a retired processor", async () => {
      const driveId = generateId();
      const processor = createMockProcessor();
      processor.onOperations = vi
        .fn()
        .mockRejectedValue(new Error("always fails"));
      const factory: ProcessorFactory = () => [
        { processor, filter: { documentId: ["*"] } },
      ];
      await processorManager.registerFactory("f", factory);

      const op = makeDriveCreateOp(driveId, 1);
      await writeToOperationIndex(operationIndex, [op]);
      await processorManager.indexOperations([op]);

      const tracked = processorManager.get(`f:${driveId}:0`);
      expect(tracked!.status).toBe("errored");
      await processorManager.unregisterFactory("f");

      await tracked!.retry();

      expect(processor.onOperations).toHaveBeenCalledTimes(1);
      expect(await cursorRow(`f:${driveId}:0`)).toBeUndefined();
    });

    it("should keep a factory's cursors when its run fails", async () => {
      const driveId = generateId();
      await insertDriveSnapshot(db, driveId);
      const { factory } = createMockProcessorFactory();
      await processorManager.registerFactory("f", factory);
      await processorManager.indexOperations([makeDriveCreateOp(driveId, 1)]);
      await processorManager.indexOperations([makeOp(driveId, 7)]);
      expect((await cursorRow(`f:${driveId}:0`))?.lastOrdinal).toBe(7);

      for (const factory of [
        () => {
          throw new Error("transient");
        },
        () => [],
      ]) {
        const restarted = new ProcessorManager(
          db as unknown as Kysely<DocumentViewDatabase>,
          operationIndex,
          mockWriteCache,
          new ConsistencyTracker(),
          new ConsoleLogger(["test"]),
          DEFAULT_DRIVE_CONTAINER_TYPES,
        );
        await restarted.init();
        await restarted.registerFactory("f", factory);
        expect((await cursorRow(`f:${driveId}:0`))?.lastOrdinal).toBe(7);
      }
    });

    it("should start a re-registered factory only after its previous processors disconnect", async () => {
      const driveId = generateId();
      const events: string[] = [];
      const held = deferred();
      const release = deferred();
      const old = createMockProcessor();
      old.onOperations = vi
        .fn()
        .mockImplementation(async (ops: OperationWithContext[]) => {
          if (ops.some((op) => op.context.ordinal === 2)) {
            held.resolve();
            await release.promise;
            events.push("old ops");
          }
        });
      old.onDisconnect = vi.fn().mockImplementation(() => {
        events.push("old disconnect");
        return Promise.resolve();
      });
      await processorManager.registerFactory("pkg", () => [
        { processor: old, filter: { documentId: ["*"] } },
      ]);
      await processorManager.indexOperations([makeDriveCreateOp(driveId, 1)]);

      const live = processorManager.indexOperations([
        makeOp(generateId(), 2, { documentType: CHILD }),
      ]);
      await held.promise;

      await processorManager.unregisterFactory("pkg");
      const replacement = createMockProcessor();
      const registered = processorManager.registerFactory("pkg", () => {
        events.push("new factory");
        return [{ processor: replacement, filter: { documentId: ["*"] } }];
      });
      release.resolve();
      await Promise.all([live, registered]);

      expect(events).toEqual(["old ops", "old disconnect", "new factory"]);
    });

    it("should start a re-registered factory only after the previous factory call has settled", async () => {
      const driveId = generateId();
      await processorManager.indexOperations([makeDriveCreateOp(driveId, 1)]);
      const events: string[] = [];
      const entered = deferred();
      const release = deferred();
      const old = createMockProcessor();
      old.onDisconnect = vi.fn().mockImplementation(() => {
        events.push("old disconnect");
        return Promise.resolve();
      });

      const first = processorManager.registerFactory("pkg", async () => {
        entered.resolve();
        await release.promise;
        events.push("old factory returned");
        return [{ processor: old, filter: {} }];
      });
      await entered.promise;

      await processorManager.unregisterFactory("pkg");
      const second = processorManager.registerFactory("pkg", () => {
        events.push("new factory");
        return [{ processor: createMockProcessor(), filter: {} }];
      });
      // A round trip on the idle connection: time for the new factory to run
      // if nothing held it back.
      await db.selectFrom("ViewState").select("lastOrdinal").execute();
      release.resolve();
      await Promise.all([first, second]);

      expect(events).toEqual([
        "old factory returned",
        "old disconnect",
        "new factory",
      ]);
    });

    it("should not hold a drive deletion behind its processors' deliveries", async () => {
      const driveId = generateId();
      const held = deferred();
      const release = deferred();
      const processor = createMockProcessor();
      processor.onOperations = vi
        .fn()
        .mockImplementation(async (ops: OperationWithContext[]) => {
          if (ops.some((op) => op.context.ordinal === 2)) {
            held.resolve();
            await release.promise;
          }
        });
      await processorManager.registerFactory("f", () => [
        { processor, filter: { documentId: ["*"] } },
      ]);
      await processorManager.indexOperations([makeDriveCreateOp(driveId, 1)]);

      const child = processorManager.indexOperations([
        makeOp(generateId(), 2, { documentType: CHILD }),
      ]);
      await held.promise;
      try {
        await processorManager.indexOperations([makeDriveDeleteOp(driveId, 3)]);
        expect(processor.onDisconnect).not.toHaveBeenCalled();
        expect(await cursorRow(`f:${driveId}:0`)).toBeUndefined();
      } finally {
        release.resolve();
      }
      await child;
      await vi.waitFor(() => expect(processor.onDisconnect).toHaveBeenCalled());
    });

    it("should never overlap two onOperations calls on one processor", async () => {
      const driveId = generateId();
      let inFlight = 0;
      let maxInFlight = 0;
      const entered = deferred();
      const processor = createMockProcessor();
      processor.onOperations = vi
        .fn()
        .mockImplementation(async (ops: OperationWithContext[]) => {
          inFlight++;
          maxInFlight = Math.max(maxInFlight, inFlight);
          if (ops.some((op) => op.context.ordinal === 2)) entered.resolve();
          await new Promise((r) => setTimeout(r, 5));
          processor.receivedOperations.push(...ops);
          inFlight--;
        });
      const factory: ProcessorFactory = () => [
        { processor, filter: { documentId: ["*"] } },
      ];
      await processorManager.registerFactory("f", factory);
      await processorManager.indexOperations([makeDriveCreateOp(driveId, 1)]);

      // The second document's batch arrives while the first is in flight.
      const first = processorManager.indexOperations([
        makeOp(generateId(), 2, { documentType: CHILD }),
      ]);
      await entered.promise;
      const second = processorManager.indexOperations([
        makeOp(generateId(), 3, { documentType: CHILD }),
      ]);
      await Promise.all([first, second]);

      expect(processor.onOperations).toHaveBeenCalledTimes(3);

      expect(ordinalsOf(processor)).toEqual([1, 2, 3]);
      expect(maxInFlight).toBe(1);
    });

    it("should keep a park when a sibling document's delivery succeeds after it", async () => {
      const driveId = generateId();
      const entered = deferred();
      const processor = createMockProcessor();
      processor.onOperations = vi
        .fn()
        .mockImplementation(async (ops: OperationWithContext[]) => {
          if (ops.some((op) => op.context.ordinal === 2)) {
            entered.resolve();
            await new Promise((r) => setTimeout(r, 5));
            throw new Error("fails on 2");
          }
        });
      const factory: ProcessorFactory = () => [
        { processor, filter: { documentId: ["*"] } },
      ];
      await processorManager.registerFactory("f", factory);
      await processorManager.indexOperations([makeDriveCreateOp(driveId, 1)]);

      // Document B's batch lands while A's is failing.
      const failing = processorManager.indexOperations([
        makeOp(generateId(), 2, { documentType: CHILD }),
      ]);
      await entered.promise;
      const sibling = processorManager.indexOperations([
        makeOp(generateId(), 3, { documentType: CHILD }),
      ]);
      await Promise.all([failing, sibling]);

      const tracked = processorManager.get(`f:${driveId}:0`);
      expect(tracked!.status).toBe("errored");
      expect(tracked!.lastOrdinal).toBe(1);
      expect((await cursorRow(`f:${driveId}:0`))?.lastOrdinal).toBe(1);
    });
  });
});

describe("ProcessorManager Backfill Paging Regression", () => {
  // Large enough that spreading it as function arguments throws a RangeError.
  const HUGE_PAGE_SIZE = 150_000;

  it("should backfill a page too large to spread as function arguments", async () => {
    const dialect = new PGliteDialect(new PGlite());
    const baseDb = new Kysely<Database>({ dialect });
    const result = await runMigrations(baseDb, REACTOR_SCHEMA);
    if (!result.success && result.error) {
      throw new Error(`Test migration failed: ${result.error.message}`);
    }
    const db = baseDb.withSchema(
      REACTOR_SCHEMA,
    ) as unknown as Kysely<CombinedDatabase>;

    const driveId = generateId();
    let serveHugePage = false;

    const emptyPage: PagedResults<OperationWithContext> = {
      results: [],
      options: { cursor: "0", limit: HUGE_PAGE_SIZE },
    };

    const stubIndex = {
      start: vi.fn(),
      commit: vi.fn().mockResolvedValue([]),
      find: vi.fn().mockResolvedValue(emptyPage),
      get: vi.fn().mockResolvedValue(emptyPage),
      getLatestTimestampForCollection: vi.fn().mockResolvedValue(null),
      getCollectionsForDocuments: vi.fn().mockResolvedValue({}),
      getGroupReferencers: vi.fn().mockResolvedValue([]),
      getSinceOrdinal: vi.fn().mockImplementation(() => {
        if (!serveHugePage) {
          return Promise.resolve(emptyPage);
        }
        serveHugePage = false;
        const template = makeOp(driveId, 0);
        const results = Array.from({ length: HUGE_PAGE_SIZE }, (_, i) => ({
          operation: template.operation,
          context: { ...template.context, ordinal: i + 1 },
        }));
        return Promise.resolve({ ...emptyPage, results });
      }),
    } as unknown as IOperationIndex;

    const mockWriteCache: IWriteCache = {
      getState: vi.fn().mockResolvedValue({}),
      putState: vi.fn(),
      putRun: vi.fn(),
      invalidate: vi.fn().mockReturnValue(0),
      clear: vi.fn(),
      startup: vi.fn().mockResolvedValue(undefined),
      shutdown: vi.fn().mockResolvedValue(undefined),
    };

    const processorManager = new ProcessorManager(
      db as unknown as Kysely<DocumentViewDatabase>,
      stubIndex,
      mockWriteCache,
      new ConsistencyTracker(),
      new ConsoleLogger(["test"]),
      DEFAULT_DRIVE_CONTAINER_TYPES,
    );
    await processorManager.init();

    // Advance the manager cursor so late registration triggers a backfill
    await processorManager.indexOperations([
      makeDriveCreateOp(driveId, HUGE_PAGE_SIZE),
    ]);

    let receivedCount = 0;
    let lastReceivedOrdinal = 0;
    const processor: IProcessor = {
      onOperations: (ops: OperationWithContext[]) => {
        receivedCount += ops.length;
        lastReceivedOrdinal = ops[ops.length - 1]!.context.ordinal;
        return Promise.resolve();
      },
      onDisconnect: () => Promise.resolve(),
    };

    serveHugePage = true;
    await processorManager.registerFactory("huge-backfill", () => [
      { processor, filter: {} },
    ]);

    const tracked = processorManager.get(`huge-backfill:${driveId}:0`);
    expect(tracked).toBeDefined();
    expect(tracked!.status).toBe("active");
    expect(tracked!.lastOrdinal).toBe(HUGE_PAGE_SIZE);
    expect(receivedCount).toBe(HUGE_PAGE_SIZE);
    expect(lastReceivedOrdinal).toBe(HUGE_PAGE_SIZE);

    await db.destroy();
  });
});

describe("ProcessorManager Cursor Identity Across Restarts", () => {
  let database: Kysely<Database>;
  let started: InProcessReactorModule[] = [];

  beforeEach(() => {
    database = new Kysely<Database>({
      dialect: new PGliteDialect(new PGlite()),
    });
  });

  afterEach(async () => {
    for (const module of started) {
      await module.reactor.kill().completed;
    }
    started = [];
    await database.destroy();
  });

  // Each call is one deployment; they share the database like a redeploy does.
  async function deploy(): Promise<InProcessReactorModule> {
    const module = await new ReactorBuilder()
      .withKysely(database)
      .withFeatures({ legacyProcessorIds: false })
      .withDocumentModelSources([
        documentModelDocumentModelModule as unknown as DocumentModelModule,
        driveDocumentModelModule as unknown as DocumentModelModule,
      ])
      .buildModule();
    started.push(module);
    return module;
  }

  async function waitForJob(
    module: InProcessReactorModule,
    jobId: string,
  ): Promise<void> {
    await vi.waitUntil(
      async () => {
        const status = await module.reactor.getJobStatus(jobId);
        if (status.status === JobStatus.FAILED) {
          throw new Error(`Job failed: ${status.error?.message}`);
        }
        return status.status === JobStatus.READ_READY;
      },
      { timeout: 5000 },
    );
  }

  // Creation and edit are serialized: concurrent batches can starve delivery.
  async function createDriveWithOps(
    module: InProcessReactorModule,
  ): Promise<string> {
    const driveDoc = createLegacyDrive();
    const created = await module.reactor.create(driveDoc);
    await waitForJob(module, created.id);
    const renamed = await module.reactor.execute(driveDoc.header.id, "main", [
      setDriveName({ name: "renamed" }),
    ]);
    await waitForJob(module, renamed.id);
    return driveDoc.header.id;
  }

  // Ids are what is under test, so processors are located by identity instead.
  function trackedFor(module: InProcessReactorModule, processor: IProcessor) {
    return module.processorManager
      .getAll()
      .find((t) => t.record.processor === processor);
  }

  async function waitForCursor(
    module: InProcessReactorModule,
    processor: IProcessor,
    ordinal: number,
  ): Promise<void> {
    await vi.waitFor(
      () => expect(trackedFor(module, processor)?.lastOrdinal).toBe(ordinal),
      { timeout: 5000 },
    );
  }

  it("should backfill a processor inserted before existing ones in the factory array", async () => {
    const first = await deploy();
    const existing = createMockProcessor("existing_v1");
    await first.processorManager.registerFactory("pkg", () => [
      { processor: existing, filter: {} },
    ]);

    await createDriveWithOps(first);
    const seen = ordinalsOf(existing);
    expect(seen.length).toBeGreaterThanOrEqual(3);
    await waitForCursor(first, existing, seen[seen.length - 1]!);
    await first.reactor.kill().completed;

    // Redeploy with a new processor inserted at index 0.
    const second = await deploy();
    const added = createMockProcessor("added_v1");
    const existing2 = createMockProcessor("existing_v1");
    await second.processorManager.registerFactory("pkg", () => [
      { processor: added, filter: {} },
      { processor: existing2, filter: {} },
    ]);

    // Never seen anything: full history expected.
    await waitForCursor(second, added, seen[seen.length - 1]!);
    expect(ordinalsOf(added)).toEqual(seen);
    // Already caught up: nothing expected.
    expect(existing2.receivedOperations).toHaveLength(0);
  });

  it("should keep a processor's cursor and status when one before it is removed", async () => {
    const first = await deploy();
    const a = createMockProcessor("a_v1");
    const b = createMockProcessor("b_v1");
    const c = createMockProcessor("c_v1");
    // `c` fails on every delivery, so it stays errored with its cursor frozen.
    c.onOperations = vi.fn().mockRejectedValue(new Error("boom"));
    await first.processorManager.registerFactory("pkg", () => [
      { processor: a, filter: {} },
      { processor: b, filter: {} },
      { processor: c, filter: {} },
    ]);

    const driveId = await createDriveWithOps(first);
    const seen = ordinalsOf(b);
    expect(seen.length).toBeGreaterThanOrEqual(3);
    await waitForCursor(first, b, seen[seen.length - 1]!);
    await vi.waitFor(
      () => expect(trackedFor(first, c)?.status).toBe("errored"),
      { timeout: 5000 },
    );
    await first.reactor.kill().completed;

    // Redeploy without `b`: `c` moves from index 2 to index 1.
    const second = await deploy();
    const a2 = createMockProcessor("a_v1");
    const c2 = createMockProcessor("c_v1");
    await second.processorManager.registerFactory("pkg", () => [
      { processor: a2, filter: {} },
      { processor: c2, filter: {} },
    ]);

    expect(a2.receivedOperations).toHaveLength(0);

    // `c` must come back as itself: still errored, and a retry delivers
    // everything it missed rather than resuming from `b`'s cursor.
    const restored = trackedFor(second, c2)!;
    expect(restored.status).toBe("errored");
    await restored.retry();
    expect(ordinalsOf(c2)).toEqual(seen);

    // `b`'s cursor is an orphan now.
    const cursors = await database
      .withSchema(REACTOR_SCHEMA)
      .selectFrom("ProcessorCursor")
      .select("processorId")
      .where("factoryId", "=", "pkg")
      .execute();
    expect(cursors.map((row) => row.processorId).sort()).toEqual([
      `pkg:${driveId}:a_v1`,
      `pkg:${driveId}:c_v1`,
    ]);
  });
});
