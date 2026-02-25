import type { Action, Operation } from "document-model";
import { v4 as uuidv4 } from "uuid";
import { describe, expect, it } from "vitest";
import { Reactor } from "../../src/core/reactor.js";
import type {
  BatchExecutionRequest,
  BatchLoadRequest,
} from "../../src/core/types.js";
import { EventBus } from "../../src/events/event-bus.js";
import {
  ReactorEventTypes,
  type JobPendingEvent,
} from "../../src/events/types.js";
import { SimpleJobExecutorManager } from "../../src/executor/simple-job-executor-manager.js";
import { InMemoryJobTracker } from "../../src/job-tracker/in-memory-job-tracker.js";
import { InMemoryQueue } from "../../src/queue/queue.js";
import { NullDocumentModelResolver } from "../../src/registry/document-model-resolver.js";
import { ReadModelCoordinator } from "../../src/read-models/coordinator.js";
import {
  createMockDocumentIndexer,
  createMockDocumentView,
  createMockJobExecutor,
  createMockLogger,
  createMockOperationStore,
  createMockReactorFeatures,
  createTestRegistry,
} from "../factories.js";

describe("batch context flow", () => {
  const createReactorAndBus = (): { reactor: Reactor; eventBus: EventBus } => {
    const registry = createTestRegistry();
    const eventBus = new EventBus();
    const queue = new InMemoryQueue(eventBus, new NullDocumentModelResolver());
    const jobTracker = new InMemoryJobTracker(eventBus);
    const readModelCoordinator = new ReadModelCoordinator(eventBus, [], []);
    const executorManager = new SimpleJobExecutorManager(
      () => createMockJobExecutor(),
      eventBus,
      queue,
      jobTracker,
      createMockLogger(),
      new NullDocumentModelResolver(),
    );

    const reactor = new Reactor(
      createMockLogger(),
      registry,
      queue,
      jobTracker,
      readModelCoordinator,
      createMockReactorFeatures(),
      createMockDocumentView(),
      createMockDocumentIndexer(),
      createMockOperationStore(),
      eventBus,
      executorManager,
    );

    return { reactor, eventBus };
  };

  const createAction = (scope: string): Action => ({
    id: uuidv4(),
    type: "TEST_ACTION",
    scope,
    timestampUtcMs: new Date().toISOString(),
    input: {},
  });

  const createOperation = (scope: string): Operation => ({
    id: uuidv4(),
    index: 0,
    timestampUtcMs: new Date().toISOString(),
    hash: "test-hash",
    skip: 0,
    action: {
      id: uuidv4(),
      type: "TEST_ACTION",
      scope,
      timestampUtcMs: new Date().toISOString(),
      input: {},
    } as Action,
  });

  describe("executeBatch", () => {
    it("should include batchId and batchJobIds in JOB_PENDING events", async () => {
      const { reactor, eventBus } = createReactorAndBus();
      const pendingEvents: JobPendingEvent[] = [];
      eventBus.subscribe<JobPendingEvent>(
        ReactorEventTypes.JOB_PENDING,
        (_type, event) => {
          pendingEvents.push(event);
        },
      );

      const request: BatchExecutionRequest = {
        jobs: [
          {
            key: "job1",
            documentId: "doc1",
            scope: "global",
            branch: "main",
            actions: [createAction("global")],
            dependsOn: [],
          },
          {
            key: "job2",
            documentId: "doc2",
            scope: "document",
            branch: "main",
            actions: [createAction("document")],
            dependsOn: [],
          },
        ],
      };

      const result = await reactor.executeBatch(request);

      expect(pendingEvents).toHaveLength(2);

      const batchId = pendingEvents[0].jobMeta.batchId;
      expect(batchId).toBeTypeOf("string");
      expect(batchId.length).toBeGreaterThan(0);

      for (const event of pendingEvents) {
        expect(event.jobMeta.batchId).toBe(batchId);
      }

      const batchJobIds = pendingEvents[0].jobMeta.batchJobIds;
      expect(batchJobIds).toBeInstanceOf(Array);
      expect(batchJobIds).toHaveLength(2);

      const resultJobIds = [result.jobs.job1.id, result.jobs.job2.id];
      expect(batchJobIds).toEqual(expect.arrayContaining(resultJobIds));
      expect(resultJobIds).toEqual(expect.arrayContaining(batchJobIds));

      for (const event of pendingEvents) {
        expect(event.jobMeta.batchJobIds).toEqual(batchJobIds);
      }
    });

    it("should preserve caller-provided meta alongside batch fields", async () => {
      const { reactor, eventBus } = createReactorAndBus();
      const pendingEvents: JobPendingEvent[] = [];
      eventBus.subscribe<JobPendingEvent>(
        ReactorEventTypes.JOB_PENDING,
        (_type, event) => {
          pendingEvents.push(event);
        },
      );

      const callerMeta = { source: "test-caller", priority: 42 };
      const request: BatchExecutionRequest = {
        jobs: [
          {
            key: "job1",
            documentId: "doc1",
            scope: "global",
            branch: "main",
            actions: [createAction("global")],
            dependsOn: [],
          },
        ],
      };

      await reactor.executeBatch(request, undefined, callerMeta);

      expect(pendingEvents).toHaveLength(1);
      const meta = pendingEvents[0].jobMeta!;
      expect(meta.source).toBe("test-caller");
      expect(meta.priority).toBe(42);
      expect(meta.batchId).toBeTypeOf("string");
      expect(meta.batchJobIds).toBeInstanceOf(Array);
    });
  });

  describe("loadBatch", () => {
    it("should include batchId and batchJobIds in JOB_PENDING events", async () => {
      const { reactor, eventBus } = createReactorAndBus();
      const pendingEvents: JobPendingEvent[] = [];
      eventBus.subscribe<JobPendingEvent>(
        ReactorEventTypes.JOB_PENDING,
        (_type, event) => {
          pendingEvents.push(event);
        },
      );

      const request: BatchLoadRequest = {
        jobs: [
          {
            key: "job1",
            documentId: "doc1",
            scope: "global",
            branch: "main",
            operations: [createOperation("global")],
            dependsOn: [],
          },
          {
            key: "job2",
            documentId: "doc2",
            scope: "document",
            branch: "main",
            operations: [createOperation("document")],
            dependsOn: [],
          },
        ],
      };

      const result = await reactor.loadBatch(request);

      expect(pendingEvents).toHaveLength(2);

      const batchId = pendingEvents[0].jobMeta.batchId;
      expect(batchId).toBeTypeOf("string");
      expect(batchId.length).toBeGreaterThan(0);

      for (const event of pendingEvents) {
        expect(event.jobMeta.batchId).toBe(batchId);
      }

      const batchJobIds = pendingEvents[0].jobMeta.batchJobIds;
      expect(batchJobIds).toBeInstanceOf(Array);
      expect(batchJobIds).toHaveLength(2);

      const resultJobIds = [result.jobs.job1.id, result.jobs.job2.id];
      expect(batchJobIds).toEqual(expect.arrayContaining(resultJobIds));
      expect(resultJobIds).toEqual(expect.arrayContaining(batchJobIds));

      for (const event of pendingEvents) {
        expect(event.jobMeta.batchJobIds).toEqual(batchJobIds);
      }
    });

    it("should preserve caller-provided meta alongside batch fields", async () => {
      const { reactor, eventBus } = createReactorAndBus();
      const pendingEvents: JobPendingEvent[] = [];
      eventBus.subscribe<JobPendingEvent>(
        ReactorEventTypes.JOB_PENDING,
        (_type, event) => {
          pendingEvents.push(event);
        },
      );

      const callerMeta = { source: "test-caller", priority: 42 };
      const request: BatchLoadRequest = {
        jobs: [
          {
            key: "job1",
            documentId: "doc1",
            scope: "global",
            branch: "main",
            operations: [createOperation("global")],
            dependsOn: [],
          },
        ],
      };

      await reactor.loadBatch(request, undefined, callerMeta);

      expect(pendingEvents).toHaveLength(1);
      const meta = pendingEvents[0].jobMeta!;
      expect(meta.source).toBe("test-caller");
      expect(meta.priority).toBe(42);
      expect(meta.batchId).toBeTypeOf("string");
      expect(meta.batchJobIds).toBeInstanceOf(Array);
    });
  });

  describe("non-batch calls", () => {
    it("should include auto-generated batchId in execute JOB_PENDING events", async () => {
      const { reactor, eventBus } = createReactorAndBus();
      const pendingEvents: JobPendingEvent[] = [];
      eventBus.subscribe<JobPendingEvent>(
        ReactorEventTypes.JOB_PENDING,
        (_type, event) => {
          pendingEvents.push(event);
        },
      );

      const jobInfo = await reactor.execute("doc1", "main", [
        createAction("global"),
      ]);

      expect(pendingEvents).toHaveLength(1);
      expect(pendingEvents[0].jobMeta.batchId).toBeTypeOf("string");
      expect(pendingEvents[0].jobMeta.batchJobIds).toEqual([jobInfo.id]);
    });

    it("should include auto-generated batchId in load JOB_PENDING events", async () => {
      const { reactor, eventBus } = createReactorAndBus();
      const pendingEvents: JobPendingEvent[] = [];
      eventBus.subscribe<JobPendingEvent>(
        ReactorEventTypes.JOB_PENDING,
        (_type, event) => {
          pendingEvents.push(event);
        },
      );

      const jobInfo = await reactor.load("doc1", "main", [
        createOperation("global"),
      ]);

      expect(pendingEvents).toHaveLength(1);
      expect(pendingEvents[0].jobMeta.batchId).toBeTypeOf("string");
      expect(pendingEvents[0].jobMeta.batchJobIds).toEqual([jobInfo.id]);
    });
  });
});
