import type { Action, Operation } from "document-model";
import { v4 as uuidv4 } from "uuid";
import { describe, expect, it } from "vitest";
import { Reactor } from "../../src/core/reactor.js";
import type { BatchLoadRequest } from "../../src/core/types.js";
import { EventBus } from "../../src/events/event-bus.js";
import { SimpleJobExecutorManager } from "../../src/executor/simple-job-executor-manager.js";
import { InMemoryJobTracker } from "../../src/job-tracker/in-memory-job-tracker.js";
import { InMemoryQueue } from "../../src/queue/queue.js";
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

describe("loadBatch validation", () => {
  const createReactor = (): Reactor => {
    const registry = createTestRegistry();
    const eventBus = new EventBus();
    const queue = new InMemoryQueue(eventBus);
    const jobTracker = new InMemoryJobTracker(eventBus);
    const readModelCoordinator = new ReadModelCoordinator(eventBus, [], []);
    const executorManager = new SimpleJobExecutorManager(
      () => createMockJobExecutor(),
      eventBus,
      queue,
      jobTracker,
      createMockLogger(),
    );

    return new Reactor(
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
  };

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

  it("should reject duplicate plan keys", async () => {
    const reactor = createReactor();
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
          key: "job1",
          documentId: "doc2",
          scope: "global",
          branch: "main",
          operations: [createOperation("global")],
          dependsOn: [],
        },
      ],
    };

    await expect(reactor.loadBatch(request)).rejects.toThrow(
      "Duplicate plan key: job1",
    );
  });

  it("should reject missing dependency reference", async () => {
    const reactor = createReactor();
    const request: BatchLoadRequest = {
      jobs: [
        {
          key: "job1",
          documentId: "doc1",
          scope: "global",
          branch: "main",
          operations: [createOperation("global")],
          dependsOn: ["nonexistent"],
        },
      ],
    };

    await expect(reactor.loadBatch(request)).rejects.toThrow(
      "depends on non-existent key: nonexistent",
    );
  });

  it("should detect dependency cycles", async () => {
    const reactor = createReactor();
    const request: BatchLoadRequest = {
      jobs: [
        {
          key: "job1",
          documentId: "doc1",
          scope: "global",
          branch: "main",
          operations: [createOperation("global")],
          dependsOn: ["job2"],
        },
        {
          key: "job2",
          documentId: "doc2",
          scope: "global",
          branch: "main",
          operations: [createOperation("global")],
          dependsOn: ["job1"],
        },
      ],
    };

    await expect(reactor.loadBatch(request)).rejects.toThrow(
      "Dependency cycle detected",
    );
  });

  it("should reject mismatched operation scopes", async () => {
    const reactor = createReactor();
    const request: BatchLoadRequest = {
      jobs: [
        {
          key: "job1",
          documentId: "doc1",
          scope: "global",
          branch: "main",
          operations: [createOperation("document")],
          dependsOn: [],
        },
      ],
    };

    await expect(reactor.loadBatch(request)).rejects.toThrow(
      "declares scope 'global' but operation has scope 'document'",
    );
  });

  it("should reject empty operations array", async () => {
    const reactor = createReactor();
    const request: BatchLoadRequest = {
      jobs: [
        {
          key: "job1",
          documentId: "doc1",
          scope: "global",
          branch: "main",
          operations: [],
          dependsOn: [],
        },
      ],
    };

    await expect(reactor.loadBatch(request)).rejects.toThrow(
      "has empty operations array",
    );
  });

  it("should accept valid batch with no dependencies", async () => {
    const reactor = createReactor();
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
    expect(result.jobs).toHaveProperty("job1");
    expect(result.jobs).toHaveProperty("job2");
    expect(result.jobs.job1.status).toBe("PENDING");
    expect(result.jobs.job2.status).toBe("PENDING");
  });

  it("should accept valid batch with dependencies", async () => {
    const reactor = createReactor();
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
          dependsOn: ["job1"],
        },
      ],
    };

    const result = await reactor.loadBatch(request);
    expect(result.jobs).toHaveProperty("job1");
    expect(result.jobs).toHaveProperty("job2");
    expect(result.jobs.job1.status).toBe("PENDING");
    expect(result.jobs.job2.status).toBe("PENDING");
  });
});
