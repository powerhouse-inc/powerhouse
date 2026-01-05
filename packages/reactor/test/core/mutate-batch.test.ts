import type { BaseDocumentDriveServer, IDocumentStorage } from "document-drive";
import type { Action } from "document-model";
import { v4 as uuidv4 } from "uuid";
import { describe, expect, it } from "vitest";
import { Reactor } from "../../src/core/reactor.js";
import type { BatchExecutionRequest } from "../../src/core/types.js";
import { EventBus } from "../../src/events/event-bus.js";
import { InMemoryJobTracker } from "../../src/job-tracker/in-memory-job-tracker.js";
import { InMemoryQueue } from "../../src/queue/queue.js";
import { ReadModelCoordinator } from "../../src/read-models/coordinator.js";
import { ConsistencyTracker } from "../../src/shared/consistency-tracker.js";
import { ConsistencyAwareLegacyStorage } from "../../src/storage/consistency-aware-legacy-storage.js";
import {
  createMockDocumentIndexer,
  createMockDocumentView,
  createMockLogger,
  createMockOperationStore,
  createMockReactorFeatures,
} from "../factories.js";

describe("mutateBatch validation", () => {
  const createMockDriveServer = (): BaseDocumentDriveServer => {
    return {
      getDocumentModelModules: () => [],
    } as unknown as BaseDocumentDriveServer;
  };

  const createMockStorage = (): IDocumentStorage => {
    return {} as IDocumentStorage;
  };

  const createReactor = (): Reactor => {
    const driveServer = createMockDriveServer();
    const storage = createMockStorage();
    const eventBus = new EventBus();
    const queue = new InMemoryQueue(eventBus);
    const jobTracker = new InMemoryJobTracker(eventBus);
    const readModelCoordinator = new ReadModelCoordinator(eventBus, [], []);
    const consistencyTracker = new ConsistencyTracker();
    const consistencyAwareStorage = new ConsistencyAwareLegacyStorage(
      storage,
      consistencyTracker,
      eventBus,
    );
    return new Reactor(
      createMockLogger(),
      driveServer,
      consistencyAwareStorage,
      queue,
      jobTracker,
      readModelCoordinator,
      createMockReactorFeatures(),
      createMockDocumentView(),
      createMockDocumentIndexer(),
      createMockOperationStore(),
    );
  };

  const createAction = (scope: string): Action => ({
    id: uuidv4(),
    type: "TEST_ACTION",
    scope,
    timestampUtcMs: new Date().toISOString(),
    input: {},
  });

  it("should reject duplicate plan keys", async () => {
    const reactor = createReactor();
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
          key: "job1",
          documentId: "doc2",
          scope: "global",
          branch: "main",
          actions: [createAction("global")],
          dependsOn: [],
        },
      ],
    };

    await expect(reactor.executeBatch(request)).rejects.toThrow(
      "Duplicate plan key: job1",
    );
  });

  it("should reject missing dependency reference", async () => {
    const reactor = createReactor();
    const request: BatchExecutionRequest = {
      jobs: [
        {
          key: "job1",
          documentId: "doc1",
          scope: "global",
          branch: "main",
          actions: [createAction("global")],
          dependsOn: ["nonexistent"],
        },
      ],
    };

    await expect(reactor.executeBatch(request)).rejects.toThrow(
      "depends on non-existent key: nonexistent",
    );
  });

  it("should detect dependency cycles", async () => {
    const reactor = createReactor();
    const request: BatchExecutionRequest = {
      jobs: [
        {
          key: "job1",
          documentId: "doc1",
          scope: "global",
          branch: "main",
          actions: [createAction("global")],
          dependsOn: ["job2"],
        },
        {
          key: "job2",
          documentId: "doc2",
          scope: "global",
          branch: "main",
          actions: [createAction("global")],
          dependsOn: ["job1"],
        },
      ],
    };

    await expect(reactor.executeBatch(request)).rejects.toThrow(
      "Dependency cycle detected",
    );
  });

  it("should reject mismatched action scopes", async () => {
    const reactor = createReactor();
    const request: BatchExecutionRequest = {
      jobs: [
        {
          key: "job1",
          documentId: "doc1",
          scope: "global",
          branch: "main",
          actions: [createAction("document")],
          dependsOn: [],
        },
      ],
    };

    await expect(reactor.executeBatch(request)).rejects.toThrow(
      "declares scope 'global' but action has scope 'document'",
    );
  });

  it("should reject empty actions array", async () => {
    const reactor = createReactor();
    const request: BatchExecutionRequest = {
      jobs: [
        {
          key: "job1",
          documentId: "doc1",
          scope: "global",
          branch: "main",
          actions: [],
          dependsOn: [],
        },
      ],
    };

    await expect(reactor.executeBatch(request)).rejects.toThrow(
      "has empty actions array",
    );
  });

  it("should accept valid batch with no dependencies", async () => {
    const reactor = createReactor();
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
    expect(result.jobs).toHaveProperty("job1");
    expect(result.jobs).toHaveProperty("job2");
    expect(result.jobs.job1.status).toBe("PENDING");
    expect(result.jobs.job2.status).toBe("PENDING");
  });

  it("should accept valid batch with dependencies", async () => {
    const reactor = createReactor();
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
          dependsOn: ["job1"],
        },
      ],
    };

    const result = await reactor.executeBatch(request);
    expect(result.jobs).toHaveProperty("job1");
    expect(result.jobs).toHaveProperty("job2");
    expect(result.jobs.job1.status).toBe("PENDING");
    expect(result.jobs.job2.status).toBe("PENDING");
  });
});
