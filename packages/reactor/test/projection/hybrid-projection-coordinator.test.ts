import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import { ConsoleLogger } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventBus } from "../../src/events/event-bus.js";
import {
  ReactorEventTypes,
  type JobReadReadyEvent,
  type ReadModelBatchCompletedEvent,
  type ReadModelIndexedEvent,
} from "../../src/events/types.js";
import { HybridProjectionCoordinator } from "../../src/projection/hybrid-projection-coordinator.js";
import { ProjectionShardManager } from "../../src/projection/projection-shard-manager.js";
import type { DbConfig } from "../../src/projection/protocol.js";
import type { IReadModel } from "../../src/read-models/interfaces.js";
import {
  ConsistencyTracker,
  type IConsistencyTracker,
} from "../../src/shared/consistency-tracker.js";
import type { ConsistencyCoordinate, JobMeta } from "../../src/shared/types.js";
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
const SHARD_ID = "projection-shard-0";

/** Fails fast with a readable message instead of stalling the suite. */
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

/** Lets fire-and-forget emits and chain bookkeeping settle. */
function flush(): Promise<void> {
  return new Promise<void>((resolve) => setImmediate(resolve));
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

type Deferred = { promise: Promise<void>; resolve: () => void };

function deferred(): Deferred {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

type RecordingReadModelOptions = {
  /** Operation indices whose `indexOperations` rejects after any gate. */
  failOn?: number[];
  /** Runs inside `indexOperations`, after any gate and before completion. */
  onIndex?: (operations: OperationWithContext[]) => Promise<void>;
};

/** Records every call into a shared sequence; each op index can be gated. */
class RecordingReadModel implements IReadModel {
  readonly indexed: number[] = [];
  private readonly gates = new Map<number, Deferred>();
  private readonly startedSignals = new Map<number, Deferred>();
  private readonly doneSignals = new Map<number, Deferred>();

  constructor(
    readonly name: string,
    private readonly sequence: string[],
    private readonly options: RecordingReadModelOptions = {},
  ) {
    allModels.add(this);
  }

  hold(index: number): void {
    this.gates.set(index, deferred());
  }

  release(index: number): void {
    this.gates.get(index)?.resolve();
  }

  releaseAll(): void {
    for (const gate of this.gates.values()) {
      gate.resolve();
    }
  }

  whenStarted(index: number): Promise<void> {
    return this.signal(this.startedSignals, index).promise;
  }

  whenDone(index: number): Promise<void> {
    return this.signal(this.doneSignals, index).promise;
  }

  async indexOperations(operations: OperationWithContext[]): Promise<void> {
    const index = operations[0]!.operation.index;
    this.indexed.push(index);
    this.sequence.push(`${this.name}:start:${index}`);
    this.signal(this.startedSignals, index).resolve();
    const gate = this.gates.get(index);
    if (gate) {
      await gate.promise;
    }
    if (this.options.onIndex) {
      await this.options.onIndex(operations);
    }
    if (this.options.failOn?.includes(index)) {
      this.sequence.push(`${this.name}:fail:${index}`);
      this.signal(this.doneSignals, index).resolve();
      throw new Error(`${this.name} failed on ${index}`);
    }
    this.sequence.push(`${this.name}:done:${index}`);
    this.signal(this.doneSignals, index).resolve();
  }

  private signal(map: Map<number, Deferred>, index: number): Deferred {
    let entry = map.get(index);
    if (!entry) {
      entry = deferred();
      map.set(index, entry);
    }
    return entry;
  }
}

const allModels = new Set<RecordingReadModel>();

type FixtureOverrides = {
  preReady?: RecordingReadModel[];
  postReady?: RecordingReadModel[];
  consistencyTrackers?: Partial<
    Record<"document-view" | "document-indexer", IConsistencyTracker>
  >;
};

type Fixture = {
  bus: EventBus;
  transports: FakeProjectionTransport[];
  manager: ProjectionShardManager;
  coordinator: HybridProjectionCoordinator;
  pre: RecordingReadModel;
  post: RecordingReadModel;
  lookupOnly: RecordingReadModel[];
  logger: ConsoleLogger;
};

function readReady(
  transport: FakeProjectionTransport,
  jobId: string,
  operations: OperationWithContext[],
): void {
  transport.send({ type: "read-ready", shardId: SHARD_ID, jobId, operations });
}

/** Answers every `drain` the host posted, as a live worker would. */
function replyDrained(transport: FakeProjectionTransport): void {
  for (const drain of transport.sentOfType("drain")) {
    transport.send({
      type: "drained",
      correlationId: drain.correlationId,
      shardId: SHARD_ID,
    });
  }
}

describe("HybridProjectionCoordinator", () => {
  let sequence: string[] = [];
  let fixture: Fixture | undefined;

  beforeEach(() => {
    sequence = [];
    allModels.clear();
  });

  afterEach(async () => {
    for (const model of allModels) {
      model.releaseAll();
    }
    if (fixture) {
      const shutdown = fixture.coordinator.shutdown();
      replyDrained(fixture.transports[0]!);
      await within(shutdown, "shutdown in afterEach", 1000);
      fixture = undefined;
    }
    vi.restoreAllMocks();
  });

  async function setup(overrides: FixtureOverrides = {}): Promise<Fixture> {
    const bus = new EventBus();
    const logger = new ConsoleLogger(["test"]);
    const { transports, factory } = createFakeProjectionTransports();
    const pre =
      overrides.preReady?.[0] ?? new RecordingReadModel("host-pre", sequence);
    const post =
      overrides.postReady?.[0] ?? new RecordingReadModel("host-post", sequence);
    const preReady = overrides.preReady ?? [pre];
    const postReady = overrides.postReady ?? [post];
    const lookupOnly = [
      new RecordingReadModel("document-view", sequence),
      new RecordingReadModel("document-indexer", sequence),
    ];

    let coordinator: HybridProjectionCoordinator | undefined;
    const manager = new ProjectionShardManager({
      shardCount: 1,
      db: DB,
      models: [],
      preReadyKinds: ["document-view", "document-indexer"],
      postReadyKinds: [],
      factory,
      logger,
      hostBus: bus,
      shutdownGraceMs: 10,
      consistencyTrackers: overrides.consistencyTrackers,
      onReadReady: (event) => coordinator!.acceptReadReady(event),
    });
    await manager.startup();

    coordinator = new HybridProjectionCoordinator({
      eventBus: bus,
      logger,
      manager,
      preReady,
      postReady,
      lookupOnly,
    });
    coordinator.start();

    bus.subscribe(
      ReactorEventTypes.JOB_READ_READY,
      (_t: number, event: JobReadReadyEvent) => {
        sequence.push(`read-ready:${event.jobId}`);
      },
    );

    fixture = {
      bus,
      transports,
      manager,
      coordinator,
      pre,
      post,
      lookupOnly,
      logger,
    };
    return fixture;
  }

  describe("ordering", () => {
    it("runs host pre-ready, then JOB_READ_READY, then host post-ready for one job", async () => {
      const { transports, post } = await setup();

      readReady(transports[0]!, "job-1", [operation("doc-1", 0)]);
      await within(post.whenDone(0), "host post-ready for job-1");

      expect(sequence).toEqual([
        "host-pre:start:0",
        "host-pre:done:0",
        "read-ready:job-1",
        "host-post:start:0",
        "host-post:done:0",
      ]);
    });

    it("serializes jobs on the same documentId:scope:branch", async () => {
      const { transports, pre, post } = await setup();
      pre.hold(0);

      readReady(transports[0]!, "job-1", [operation("doc-1", 0)]);
      readReady(transports[0]!, "job-2", [operation("doc-1", 1)]);
      await within(pre.whenStarted(0), "job-1 pre-ready start");

      await expect(
        within(pre.whenStarted(1), "job-2 pre-ready start", 50),
      ).rejects.toThrow("did not settle");
      expect(pre.indexed).toEqual([0]);

      pre.release(0);
      await within(post.whenDone(1), "job-2 post-ready");

      expect(sequence.indexOf("read-ready:job-1")).toBeLessThan(
        sequence.indexOf("host-pre:start:1"),
      );
      expect(sequence.indexOf("host-post:done:0")).toBeLessThan(
        sequence.indexOf("host-pre:start:1"),
      );
    });

    it("runs different keys concurrently", async () => {
      const { transports, pre, post } = await setup();
      pre.hold(0);

      readReady(transports[0]!, "job-1", [operation("doc-1", 0)]);
      readReady(transports[0]!, "job-2", [operation("doc-2", 5)]);
      await within(pre.whenStarted(0), "job-1 pre-ready start");

      await within(post.whenDone(5), "job-2 completes while job-1 is held");
      expect(sequence).toContain("read-ready:job-2");
      expect(sequence).not.toContain("host-pre:done:0");

      pre.release(0);
      await within(post.whenDone(0), "job-1 post-ready");
    });

    it("host pre-ready sees both built-in trackers already at the job's coordinates", async () => {
      const documentView = new ConsistencyTracker();
      const documentIndexer = new ConsistencyTracker();
      const viewUpdate = vi.spyOn(documentView, "update");
      const indexerUpdate = vi.spyOn(documentIndexer, "update");
      const ops = [operation("doc-1", 3)];
      const coordinates: ConsistencyCoordinate[] = [
        {
          documentId: "doc-1",
          scope: "global",
          branch: "main",
          operationIndex: 3,
        },
      ];
      let observed: "consistent" | "waiting" | undefined;
      const pre = new RecordingReadModel("host-pre", sequence, {
        onIndex: async () => {
          try {
            await within(
              Promise.all([
                documentView.waitFor(coordinates),
                documentIndexer.waitFor(coordinates),
              ]),
              "trackers inside host pre-ready",
              50,
            );
            observed = "consistent";
          } catch {
            observed = "waiting";
          }
        },
      });
      const { bus, transports, post } = await setup({
        preReady: [pre],
        consistencyTrackers: {
          "document-view": documentView,
          "document-indexer": documentIndexer,
        },
      });

      await bus.emit(ReactorEventTypes.JOB_WRITE_READY, {
        jobId: "job-1",
        operations: ops,
        jobMeta: JOB_META,
      });
      expect(transports[0]!.sentOfType("write-ready")).toHaveLength(1);

      for (const readModelName of ["document-view", "document-indexer"]) {
        transports[0]!.send({
          type: "readmodel-indexed",
          shardId: SHARD_ID,
          jobId: "job-1",
          readModelName,
          stage: "pre_ready",
          durationMs: 1,
          operationCount: ops.length,
          success: true,
        });
      }
      readReady(transports[0]!, "job-1", ops);
      await within(post.whenDone(3), "job-1 post-ready");

      expect(observed).toBe("consistent");
      expect(viewUpdate).toHaveBeenCalledTimes(1);
      expect(indexerUpdate).toHaveBeenCalledTimes(1);
    });
  });

  describe("failure", () => {
    it("still emits JOB_READ_READY and runs post-ready when host pre-ready throws", async () => {
      const pre = new RecordingReadModel("host-pre", sequence, { failOn: [0] });
      const { transports, post, logger } = await setup({ preReady: [pre] });
      const errorSpy = vi
        .spyOn(logger, "error")
        .mockImplementation(() => undefined);

      readReady(transports[0]!, "job-1", [operation("doc-1", 0)]);
      await within(post.whenDone(0), "job-1 post-ready");

      expect(sequence).toEqual([
        "host-pre:start:0",
        "host-pre:fail:0",
        "read-ready:job-1",
        "host-post:start:0",
        "host-post:done:0",
      ]);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(String(errorSpy.mock.calls[0]![0])).toContain(
        "Host pre-ready read model indexing failed",
      );

      readReady(transports[0]!, "job-2", [operation("doc-1", 1)]);
      await within(post.whenDone(1), "job-2 post-ready");
      expect(sequence).toContain("read-ready:job-2");
      expect(sequence).toContain("host-pre:done:1");
    });

    it("completes the chain and runs the next job when host post-ready throws", async () => {
      const post = new RecordingReadModel("host-post", sequence, {
        failOn: [0],
      });
      const { transports, logger } = await setup({ postReady: [post] });
      const errorSpy = vi
        .spyOn(logger, "error")
        .mockImplementation(() => undefined);

      readReady(transports[0]!, "job-1", [operation("doc-1", 0)]);
      readReady(transports[0]!, "job-2", [operation("doc-1", 1)]);
      await within(post.whenDone(1), "job-2 post-ready");

      expect(sequence).toContain("host-post:fail:0");
      expect(sequence).toContain("read-ready:job-2");
      expect(sequence).toContain("host-post:done:1");
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(String(errorSpy.mock.calls[0]![0])).toContain(
        "Host post-ready read model indexing failed",
      );
    });

    it("shuts down promptly after the worker has already exited", async () => {
      const { transports, coordinator } = await setup();

      transports[0]!.emit("exit", 1);

      await within(coordinator.shutdown(), "shutdown after worker exit");
      expect(transports[0]!.terminateCalls).toBe(1);
    });

    it("shuts down promptly when the worker exits while the drain is pending", async () => {
      const { transports, coordinator } = await setup();

      const shutdown = coordinator.shutdown();
      expect(transports[0]!.sentOfType("drain")).toHaveLength(1);
      transports[0]!.emit("exit", 1);

      await within(shutdown, "shutdown with a worker exit mid-drain");
      expect(transports[0]!.terminateCalls).toBe(1);
    });

    it("emits JOB_READ_READY host-side for a zero-operation job without a chain or a write-ready", async () => {
      const { bus, transports, coordinator } = await setup();
      const ready = nextEvent<JobReadReadyEvent>(
        bus,
        ReactorEventTypes.JOB_READ_READY,
      );

      await bus.emit(ReactorEventTypes.JOB_WRITE_READY, {
        jobId: "job-empty",
        operations: [],
        jobMeta: JOB_META,
      });

      const event = await within(ready, "zero-operation JOB_READ_READY");
      expect(event).toEqual({ jobId: "job-empty", operations: [] });
      expect(coordinator.getChainDepth()).toBe(0);
      expect(transports[0]!.sentOfType("write-ready")).toHaveLength(0);
    });
  });

  describe("lifecycle", () => {
    it("drain resolves only after the worker drained and host chains are empty", async () => {
      const { transports, coordinator, pre, post } = await setup();
      pre.hold(0);
      readReady(transports[0]!, "job-1", [operation("doc-1", 0)]);
      await within(pre.whenStarted(0), "job-1 pre-ready start");

      const drain = coordinator.drain();
      expect(transports[0]!.sentOfType("drain")).toHaveLength(1);
      await expect(
        within(drain, "drain before the worker drained", 50),
      ).rejects.toThrow("did not settle");

      replyDrained(transports[0]!);
      await expect(
        within(drain, "drain with a host chain still held", 50),
      ).rejects.toThrow("did not settle");

      pre.release(0);
      await within(drain, "drain after host chains flushed");
      expect(sequence).toContain("host-post:done:0");
      await within(post.whenDone(0), "job-1 post-ready");
    });

    it("getChainDepth sums the worker-reported depth and the host chain count", async () => {
      const { transports, coordinator, pre, post } = await setup();
      expect(coordinator.getChainDepth()).toBe(0);

      transports[0]!.send({
        type: "chain-depth",
        shardId: SHARD_ID,
        depth: 3,
        timestamp: Date.now(),
      });
      expect(coordinator.getChainDepth()).toBe(3);

      pre.hold(0);
      readReady(transports[0]!, "job-1", [operation("doc-1", 0)]);
      readReady(transports[0]!, "job-2", [operation("doc-2", 7)]);
      await within(pre.whenStarted(0), "job-1 pre-ready start");
      expect(coordinator.getChainDepth()).toBe(5);

      await within(post.whenDone(7), "job-2 post-ready");
      await flush();
      expect(coordinator.getChainDepth()).toBe(4);

      pre.release(0);
      await within(post.whenDone(0), "job-1 post-ready");
      const drain = coordinator.drain();
      replyDrained(transports[0]!);
      await within(drain, "drain");
      expect(coordinator.getChainDepth()).toBe(3);
    });

    it("addReadModel indexes on later jobs at its stage and is visible through the captured array", async () => {
      const { transports, coordinator, post } = await setup();
      const captured = coordinator.readModels;
      const addedPre = new RecordingReadModel("added-pre", sequence);
      const addedPost = new RecordingReadModel("added-post", sequence);

      coordinator.addReadModel(addedPre, "pre_ready");
      coordinator.addReadModel(addedPost, "post_ready");
      expect(() =>
        coordinator.addReadModel(
          new RecordingReadModel("added-pre", sequence),
          "pre_ready",
        ),
      ).toThrow('Read model "added-pre" is already registered');
      expect(() =>
        coordinator.addReadModel(
          new RecordingReadModel("document-view", sequence),
          "pre_ready",
        ),
      ).toThrow('Read model "document-view" is already registered');

      expect(captured).toContain(addedPre);
      expect(captured).toContain(addedPost);
      expect(captured).toBe(coordinator.readModels);

      readReady(transports[0]!, "job-1", [operation("doc-1", 0)]);
      await within(
        Promise.all([post.whenDone(0), addedPost.whenDone(0)]),
        "job-1 post-ready",
      );

      const readReadyAt = sequence.indexOf("read-ready:job-1");
      expect(sequence.indexOf("added-pre:done:0")).toBeLessThan(readReadyAt);
      expect(sequence.indexOf("added-post:start:0")).toBeGreaterThan(
        readReadyAt,
      );
    });

    it("readModels lists host models and the lookup-only built-ins, which are never indexed", async () => {
      const { transports, coordinator, pre, post, lookupOnly } = await setup();

      expect(coordinator.readModels.map((m) => m.name)).toEqual([
        "host-pre",
        "host-post",
        "document-view",
        "document-indexer",
      ]);
      expect(coordinator.readModels).toContain(pre);
      expect(coordinator.readModels).toContain(post);

      readReady(transports[0]!, "job-1", [operation("doc-1", 0)]);
      await within(post.whenDone(0), "job-1 post-ready");

      for (const model of lookupOnly) {
        expect(model.indexed).toEqual([]);
      }
    });
  });

  describe("metrics", () => {
    it("emits one READMODEL_INDEXED per host model and relies on the worker's batch-completed", async () => {
      const { bus, transports, post } = await setup();
      const indexed: ReadModelIndexedEvent[] = [];
      const completed: ReadModelBatchCompletedEvent[] = [];
      bus.subscribe(
        ReactorEventTypes.READMODEL_INDEXED,
        (_t: number, event: ReadModelIndexedEvent) => {
          indexed.push(event);
        },
      );
      bus.subscribe(
        ReactorEventTypes.READMODEL_BATCH_COMPLETED,
        (_t: number, event: ReadModelBatchCompletedEvent) => {
          completed.push(event);
        },
      );
      const ops = [operation("doc-1", 0)];

      transports[0]!.send({
        type: "readmodel-indexed",
        shardId: SHARD_ID,
        jobId: "job-1",
        readModelName: "document-view",
        stage: "pre_ready",
        durationMs: 1,
        operationCount: 1,
        success: true,
      });
      readReady(transports[0]!, "job-1", ops);
      await within(post.whenDone(0), "job-1 post-ready");
      await flush();

      expect(completed).toHaveLength(0);

      transports[0]!.send({
        type: "readmodel-batch-completed",
        shardId: SHARD_ID,
        jobId: "job-1",
        batchSize: 1,
        chainWaitDurationMs: 0,
        preReadyDurationMs: 1,
        emitDurationMs: 1,
        postReadyDurationMs: 0,
      });
      await flush();

      expect(completed.filter((e) => e.jobId === "job-1")).toHaveLength(1);

      const host = indexed.filter((e) => e.readModelName.startsWith("host-"));
      expect(host).toHaveLength(2);
      expect(host.map((e) => [e.readModelName, e.stage, e.success])).toEqual([
        ["host-pre", "pre_ready", true],
        ["host-post", "post_ready", true],
      ]);
      expect(host.every((e) => e.jobId === "job-1")).toBe(true);
      expect(host.every((e) => e.operationCount === 1)).toBe(true);
      expect(
        indexed.filter((e) => e.readModelName === "document-view"),
      ).toHaveLength(1);
    });
  });
});
