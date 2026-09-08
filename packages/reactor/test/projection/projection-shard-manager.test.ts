import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import { ConsoleLogger } from "document-model";
import { afterEach, describe, expect, it } from "vitest";
import { EventBus } from "../../src/events/event-bus.js";
import {
  ReactorEventTypes,
  type JobReadReadyEvent,
  type ReadModelBatchCompletedEvent,
} from "../../src/events/types.js";
import { ProjectionShardManager } from "../../src/projection/projection-shard-manager.js";
import type { DbConfig } from "../../src/projection/protocol.js";
import { ConsistencyTracker } from "../../src/shared/consistency-tracker.js";
import type { JobMeta } from "../../src/shared/types.js";
import {
  createFakeProjectionTransports,
  type FakeProjectionTransport,
} from "./fake-projection-transport.js";

const DB: DbConfig = {
  host: "localhost",
  port: 5432,
  database: "test",
  user: "test",
  password: "test",
};

const JOB_META: JobMeta = { batchId: "batch-1", batchJobIds: [] };

/**
 * Fails fast with a readable message instead of stalling the suite when the
 * thing under test never settles. `label` names what was expected.
 */
async function within<T>(
  promise: Promise<T>,
  label: string,
  timeoutMs = 250,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const bomb = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} did not settle within ${timeoutMs}ms`)),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([promise, bomb]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

/** Resolves on the first event of `type` seen on `bus`. */
function nextEvent<T>(bus: EventBus, type: number): Promise<T> {
  return new Promise<T>((resolve) => {
    const unsubscribe = bus.subscribe(type, (_t: number, event: T) => {
      unsubscribe();
      resolve(event);
    });
  });
}

function operation(
  documentId: string,
  index: number,
  overrides: Partial<OperationWithContext["context"]> = {},
): OperationWithContext {
  return {
    operation: {
      index,
      skip: 0,
      hash: `hash-${index}`,
      timestampUtcMs: "2024-01-01T00:00:00.000Z",
      action: {
        id: `action-${index}`,
        type: "SET_NAME",
        scope: "global",
        timestampUtcMs: "2024-01-01T00:00:00.000Z",
        input: { name: "test" },
      },
      id: `op-${index}`,
      resultingState: JSON.stringify({ state: "test" }),
    },
    context: {
      documentId,
      documentType: "test",
      scope: "global",
      branch: "main",
      ordinal: index + 1,
      ...overrides,
    },
  };
}

describe("ProjectionShardManager", () => {
  let manager: ProjectionShardManager | undefined;

  afterEach(async () => {
    if (manager) {
      await manager.shutdown();
      manager = undefined;
    }
  });

  async function startManager(
    overrides: {
      shardCount?: number;
      consistencyTrackers?: ConstructorParameters<
        typeof ProjectionShardManager
      >[0]["consistencyTrackers"];
      onShardFatal?: (shardId: string, reason: Error) => void;
      preReadyKinds?: ("document-view" | "document-indexer")[];
    } = {},
  ): Promise<{
    manager: ProjectionShardManager;
    bus: EventBus;
    transports: FakeProjectionTransport[];
  }> {
    const bus = new EventBus();
    const { transports, factory } = createFakeProjectionTransports();
    const created = new ProjectionShardManager({
      shardCount: overrides.shardCount ?? 1,
      db: DB,
      models: [],
      preReadyKinds: overrides.preReadyKinds ?? [
        "document-view",
        "document-indexer",
      ],
      postReadyKinds: [],
      factory,
      logger: new ConsoleLogger(["test"]),
      hostBus: bus,
      shutdownGraceMs: 10,
      consistencyTrackers: overrides.consistencyTrackers,
      onShardFatal: overrides.onShardFatal,
    });
    await created.startup();
    created.start();
    manager = created;
    return { manager: created, bus, transports };
  }

  describe("zero-operation jobs", () => {
    it("emits JOB_READ_READY for a job with no operations", async () => {
      const { bus } = await startManager();

      const readReady = nextEvent<JobReadReadyEvent>(
        bus,
        ReactorEventTypes.JOB_READ_READY,
      );

      await bus.emit(ReactorEventTypes.JOB_WRITE_READY, {
        jobId: "job-empty",
        operations: [],
        jobMeta: JOB_META,
      });

      const event = await within(
        readReady,
        "JOB_READ_READY for a zero-operation job",
      );
      expect(event).toEqual({ jobId: "job-empty", operations: [] });
    });

    it("emits a zeroed READMODEL_BATCH_COMPLETED for a job with no operations", async () => {
      const { bus } = await startManager();

      const completed = nextEvent<ReadModelBatchCompletedEvent>(
        bus,
        ReactorEventTypes.READMODEL_BATCH_COMPLETED,
      );

      await bus.emit(ReactorEventTypes.JOB_WRITE_READY, {
        jobId: "job-empty",
        operations: [],
        jobMeta: JOB_META,
      });

      const event = await within(
        completed,
        "READMODEL_BATCH_COMPLETED for a zero-operation job",
      );
      expect(event).toEqual({
        jobId: "job-empty",
        batchSize: 0,
        chainWaitDurationMs: 0,
        preReadyDurationMs: 0,
        emitDurationMs: 0,
        postReadyDurationMs: 0,
      });
    });

    it("does not post a write-ready to any shard for a zero-operation job", async () => {
      const { bus, transports } = await startManager();

      await bus.emit(ReactorEventTypes.JOB_WRITE_READY, {
        jobId: "job-empty",
        operations: [],
        jobMeta: JOB_META,
      });

      expect(transports[0]!.sentOfType("write-ready")).toHaveLength(0);
    });
  });

  describe("a shard that is not ready", () => {
    it("reports the dropped job through onShardFatal instead of only warning", async () => {
      const fatals: { shardId: string; reason: Error }[] = [];
      const { bus, transports } = await startManager({
        onShardFatal: (shardId, reason) => fatals.push({ shardId, reason }),
      });

      transports[0]!.emit("exit", 1);
      expect(fatals).toHaveLength(1);
      expect(fatals[0]!.shardId).toBe("projection-shard-0");

      await bus.emit(ReactorEventTypes.JOB_WRITE_READY, {
        jobId: "job-dropped",
        operations: [operation("doc-1", 0)],
        jobMeta: JOB_META,
      });

      expect(transports[0]!.sentOfType("write-ready")).toHaveLength(0);
      expect(fatals).toHaveLength(2);
      expect(fatals[1]!.reason.message).toContain("job-dropped");
      expect(fatals[1]!.reason.message).toContain("projection-shard-0");
      expect(fatals[1]!.reason.message).toContain("doc-1");
    });

    it("does not report a shard exit during shutdown as fatal", async () => {
      const fatals: { shardId: string; reason: Error }[] = [];
      const { manager: created, transports } = await startManager({
        onShardFatal: (shardId, reason) => fatals.push({ shardId, reason }),
      });

      const shutdown = created.shutdown();
      transports[0]!.emit("exit", 0);
      await shutdown;
      manager = undefined;

      expect(fatals).toHaveLength(0);
    });

    it("reports a transport error through onShardFatal", async () => {
      const fatals: { shardId: string; reason: Error }[] = [];
      const { transports } = await startManager({
        onShardFatal: (shardId, reason) => fatals.push({ shardId, reason }),
      });

      transports[0]!.emit("error", new Error("boom"));

      expect(fatals).toHaveLength(1);
      expect(fatals[0]!.shardId).toBe("projection-shard-0");
      expect(fatals[0]!.reason.message).toContain("boom");
    });
  });

  describe("host consistency trackers", () => {
    it("advances the tracker for each built-in read model the shard indexed", async () => {
      const documentView = new ConsistencyTracker();
      const documentIndexer = new ConsistencyTracker();
      const { bus, transports } = await startManager({
        consistencyTrackers: {
          "document-view": documentView,
          "document-indexer": documentIndexer,
        },
      });

      const ops = [operation("doc-1", 3)];
      await bus.emit(ReactorEventTypes.JOB_WRITE_READY, {
        jobId: "job-1",
        operations: ops,
        jobMeta: JOB_META,
      });

      expect(transports[0]!.sentOfType("write-ready")).toHaveLength(1);

      const coordinates = [
        {
          documentId: "doc-1",
          scope: "global",
          branch: "main",
          operationIndex: 3,
        },
      ];
      const waitView = documentView.waitFor(coordinates);
      const waitIndexer = documentIndexer.waitFor(coordinates);

      for (const readModelName of ["document-view", "document-indexer"]) {
        transports[0]!.send({
          type: "readmodel-indexed",
          shardId: "projection-shard-0",
          jobId: "job-1",
          readModelName,
          stage: "pre_ready",
          durationMs: 1,
          operationCount: ops.length,
          success: true,
        });
      }

      await within(
        Promise.all([waitView, waitIndexer]),
        "host consistency trackers advancing from a relayed readmodel-indexed",
      );
    });

    it("does not advance a tracker when the shard failed to index", async () => {
      const documentView = new ConsistencyTracker();
      const { bus, transports } = await startManager({
        consistencyTrackers: { "document-view": documentView },
      });

      await bus.emit(ReactorEventTypes.JOB_WRITE_READY, {
        jobId: "job-1",
        operations: [operation("doc-1", 3)],
        jobMeta: JOB_META,
      });

      transports[0]!.send({
        type: "readmodel-indexed",
        shardId: "projection-shard-0",
        jobId: "job-1",
        readModelName: "document-view",
        stage: "pre_ready",
        durationMs: 1,
        operationCount: 1,
        success: false,
      });

      expect(documentView.getLatest("doc-1:global:main")).toBeUndefined();
    });
  });
});
