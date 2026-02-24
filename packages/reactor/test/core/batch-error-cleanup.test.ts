import type { Action, Operation } from "document-model";
import { v4 as uuidv4 } from "uuid";
import { describe, expect, it, vi } from "vitest";
import { Reactor } from "../../src/core/reactor.js";
import type {
  BatchExecutionRequest,
  BatchLoadRequest,
} from "../../src/core/types.js";
import { EventBus } from "../../src/events/event-bus.js";
import { SimpleJobExecutorManager } from "../../src/executor/simple-job-executor-manager.js";
import { InMemoryJobTracker } from "../../src/job-tracker/in-memory-job-tracker.js";
import type { IQueue } from "../../src/queue/interfaces.js";
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

describe("batch enqueue error cleanup", () => {
  const createAction = (scope: string): Action =>
    ({
      id: uuidv4(),
      type: "TEST_ACTION",
      scope,
      timestampUtcMs: new Date().toISOString(),
      input: {},
    }) as Action;

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

  function createReactorWithQueue(queue: IQueue) {
    const registry = createTestRegistry();
    const eventBus = new EventBus();
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

    return {
      reactor: new Reactor(
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
      ),
      jobTracker,
    };
  }

  describe("executeBatch cleanup on partial enqueue failure", () => {
    it("should attempt to remove partially enqueued jobs when enqueue throws", async () => {
      const eventBus = new EventBus();
      const realQueue = new InMemoryQueue(
        eventBus,
        new NullDocumentModelResolver(),
      );

      let enqueueCount = 0;
      const removeSpy = vi.spyOn(realQueue, "remove");
      vi.spyOn(realQueue, "enqueue").mockImplementation((): Promise<void> => {
        enqueueCount++;
        if (enqueueCount === 2) {
          return Promise.reject(new Error("Queue full"));
        }
        return Promise.resolve();
      });

      const { reactor } = createReactorWithQueue(realQueue);
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
            scope: "global",
            branch: "main",
            actions: [createAction("global")],
            dependsOn: [],
          },
        ],
      };

      await expect(reactor.executeBatch(request)).rejects.toThrow("Queue full");

      expect(removeSpy).toHaveBeenCalledTimes(1);
    });

    it("should mark all jobs as FAILED when enqueue throws", async () => {
      const eventBus = new EventBus();
      const realQueue = new InMemoryQueue(
        eventBus,
        new NullDocumentModelResolver(),
      );

      let enqueueCount = 0;
      vi.spyOn(realQueue, "enqueue").mockImplementation((): Promise<void> => {
        enqueueCount++;
        if (enqueueCount === 2) {
          return Promise.reject(new Error("Queue full"));
        }
        return Promise.resolve();
      });

      const { reactor, jobTracker } = createReactorWithQueue(realQueue);
      const markFailedSpy = vi.spyOn(jobTracker, "markFailed");

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
            scope: "global",
            branch: "main",
            actions: [createAction("global")],
            dependsOn: [],
          },
          {
            key: "job3",
            documentId: "doc3",
            scope: "global",
            branch: "main",
            actions: [createAction("global")],
            dependsOn: [],
          },
        ],
      };

      await expect(reactor.executeBatch(request)).rejects.toThrow("Queue full");

      expect(markFailedSpy).toHaveBeenCalledTimes(3);
      for (const call of markFailedSpy.mock.calls) {
        expect(call[1].message).toBe("Batch enqueue failed");
      }
    });

    it("should tolerate errors during cleanup removal", async () => {
      const eventBus = new EventBus();
      const realQueue = new InMemoryQueue(
        eventBus,
        new NullDocumentModelResolver(),
      );

      let enqueueCount = 0;
      vi.spyOn(realQueue, "enqueue").mockImplementation((): Promise<void> => {
        enqueueCount++;
        if (enqueueCount === 3) {
          return Promise.reject(new Error("Queue full"));
        }
        return Promise.resolve();
      });

      vi.spyOn(realQueue, "remove").mockRejectedValue(
        new Error("Remove failed"),
      );

      const { reactor } = createReactorWithQueue(realQueue);
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
            scope: "global",
            branch: "main",
            actions: [createAction("global")],
            dependsOn: [],
          },
          {
            key: "job3",
            documentId: "doc3",
            scope: "global",
            branch: "main",
            actions: [createAction("global")],
            dependsOn: [],
          },
        ],
      };

      await expect(reactor.executeBatch(request)).rejects.toThrow("Queue full");
    });
  });

  describe("loadBatch cleanup on partial enqueue failure", () => {
    it("should attempt to remove partially enqueued jobs when enqueue throws", async () => {
      const eventBus = new EventBus();
      const realQueue = new InMemoryQueue(
        eventBus,
        new NullDocumentModelResolver(),
      );

      let enqueueCount = 0;
      const removeSpy = vi.spyOn(realQueue, "remove");
      vi.spyOn(realQueue, "enqueue").mockImplementation((): Promise<void> => {
        enqueueCount++;
        if (enqueueCount === 2) {
          return Promise.reject(new Error("Queue full"));
        }
        return Promise.resolve();
      });

      const { reactor } = createReactorWithQueue(realQueue);
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
            scope: "global",
            branch: "main",
            operations: [createOperation("global")],
            dependsOn: [],
          },
        ],
      };

      await expect(reactor.loadBatch(request)).rejects.toThrow("Queue full");

      expect(removeSpy).toHaveBeenCalledTimes(1);
    });

    it("should mark all jobs as FAILED when enqueue throws", async () => {
      const eventBus = new EventBus();
      const realQueue = new InMemoryQueue(
        eventBus,
        new NullDocumentModelResolver(),
      );

      let enqueueCount = 0;
      vi.spyOn(realQueue, "enqueue").mockImplementation((): Promise<void> => {
        enqueueCount++;
        if (enqueueCount === 2) {
          return Promise.reject(new Error("Queue full"));
        }
        return Promise.resolve();
      });

      const { reactor, jobTracker } = createReactorWithQueue(realQueue);
      const markFailedSpy = vi.spyOn(jobTracker, "markFailed");

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
            scope: "global",
            branch: "main",
            operations: [createOperation("global")],
            dependsOn: [],
          },
          {
            key: "job3",
            documentId: "doc3",
            scope: "global",
            branch: "main",
            operations: [createOperation("global")],
            dependsOn: [],
          },
        ],
      };

      await expect(reactor.loadBatch(request)).rejects.toThrow("Queue full");

      expect(markFailedSpy).toHaveBeenCalledTimes(3);
      for (const call of markFailedSpy.mock.calls) {
        expect(call[1].message).toBe("Batch enqueue failed");
      }
    });
  });
});
