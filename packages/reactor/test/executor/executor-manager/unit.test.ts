import type { DocumentModelModule } from "document-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventBus } from "../../../src/events/event-bus.js";
import type { IEventBus } from "../../../src/events/interfaces.js";
import type { IJobExecutor } from "../../../src/executor/interfaces.js";
import type { JobExecutorFactory } from "../../../src/executor/simple-job-executor-manager.js";
import { SimpleJobExecutorManager } from "../../../src/executor/simple-job-executor-manager.js";
import type { JobResult } from "../../../src/executor/types.js";
import { InMemoryJobTracker } from "../../../src/job-tracker/in-memory-job-tracker.js";
import type { IJobTracker } from "../../../src/job-tracker/interfaces.js";
import type { IQueue } from "../../../src/queue/interfaces.js";
import { InMemoryQueue } from "../../../src/queue/queue.js";
import type { IJobExecutionHandle, Job } from "../../../src/queue/types.js";
import { JobQueueState } from "../../../src/queue/types.js";
import {
  DocumentModelResolver,
  NullDocumentModelResolver,
} from "../../../src/registry/document-model-resolver.js";
import {
  DocumentModelRegistry,
  ModuleNotFoundError,
} from "../../../src/registry/implementation.js";
import type { IDocumentModelLoader } from "../../../src/registry/interfaces.js";
import { createMockLogger, createTestJob } from "../../factories.js";

describe("SimpleJobExecutorManager", () => {
  let manager: SimpleJobExecutorManager;
  let mockExecutors: IJobExecutor[];
  let executorFactory: JobExecutorFactory;
  let eventBus: IEventBus;
  let queue: IQueue;
  let jobTracker: IJobTracker;

  // Create a mock executor
  const createMockExecutor = (): IJobExecutor => {
    const mockExecutor: IJobExecutor = {
      executeJob: vi.fn().mockResolvedValue({
        job: {} as Job,
        success: true,
        duration: 10,
      } as JobResult),
    };

    mockExecutors.push(mockExecutor);
    return mockExecutor;
  };

  beforeEach(() => {
    mockExecutors = [];
    eventBus = new EventBus();
    queue = new InMemoryQueue(eventBus, new NullDocumentModelResolver());
    jobTracker = new InMemoryJobTracker(eventBus);

    // Create factory that returns mock executors
    executorFactory = vi.fn(() => createMockExecutor());

    manager = new SimpleJobExecutorManager(
      executorFactory,
      eventBus,
      queue,
      jobTracker,
      createMockLogger(),
      new NullDocumentModelResolver(),
    );
  });

  describe("start", () => {
    it("should start with specified number of executors", async () => {
      await manager.start(3);
      const executors = manager.getExecutors();
      expect(executors).toHaveLength(3);
      expect(executorFactory).toHaveBeenCalledTimes(3);
    });

    it("should throw error if already running", async () => {
      await manager.start(2);
      await expect(manager.start(2)).rejects.toThrow(
        "JobExecutorManager is already running",
      );
    });

    it("should throw error for invalid number of executors", async () => {
      await expect(manager.start(0)).rejects.toThrow(
        "Number of executors must be at least 1",
      );
      await expect(manager.start(-1)).rejects.toThrow(
        "Number of executors must be at least 1",
      );
    });
  });

  describe("stop", () => {
    it("should stop gracefully", async () => {
      await manager.start(3);
      await manager.stop(true);
      const executors = manager.getExecutors();
      expect(executors).toHaveLength(0);
    });

    it("should stop immediately", async () => {
      await manager.start(3);
      await manager.stop(false);
      const executors = manager.getExecutors();
      expect(executors).toHaveLength(0);
    });

    it("should handle stop when not running", async () => {
      await expect(manager.stop()).resolves.not.toThrow();
    });
  });

  describe("getExecutors", () => {
    it("should return empty array when no executors", () => {
      const executors = manager.getExecutors();
      expect(executors).toEqual([]);
    });

    it("should return all executors", async () => {
      await manager.start(3);
      const executors = manager.getExecutors();
      expect(executors).toHaveLength(3);
    });

    it("should return a copy of executors array", async () => {
      await manager.start(2);
      const executors1 = manager.getExecutors();
      const executors2 = manager.getExecutors();
      expect(executors1).not.toBe(executors2);
      expect(executors1).toEqual(executors2);
    });
  });

  describe("getStatus", () => {
    it("should return status when not running", () => {
      const status = manager.getStatus();
      expect(status.isRunning).toBe(false);
      expect(status.numExecutors).toBe(0);
      expect(status.activeJobs).toBe(0);
      expect(status.totalJobsProcessed).toBe(0);
    });

    it("should return status when running", async () => {
      await manager.start(3);
      const status = manager.getStatus();
      expect(status.isRunning).toBe(true);
      expect(status.numExecutors).toBe(3);
      expect(status.activeJobs).toBe(0);
      expect(status.totalJobsProcessed).toBe(0);
    });
  });

  describe("job processing", () => {
    it("should process jobs when they become available", async () => {
      await manager.start(1);

      const job: Job = {
        id: "job-1",
        kind: "mutation",
        documentId: "doc-1",
        scope: "global",
        branch: "main",
        actions: [
          {
            id: "action-1",
            type: "CREATE",
            scope: "global",
            timestampUtcMs: "123",
            input: {},
          },
        ],
        operations: [],
        createdAt: "123",
        queueHint: [],
        errorHistory: [],
        meta: { batchId: "test", batchJobIds: ["job-1"] },
      };

      // Enqueue a job
      await queue.enqueue(job);

      // Give the manager time to process
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check that the executor was called
      expect(mockExecutors[0].executeJob).toHaveBeenCalledWith(job);
    });

    it("should call start() on the job execution handle", async () => {
      const job: Job = {
        id: "job-1",
        kind: "mutation",
        documentId: "doc-1",
        scope: "global",
        branch: "main",
        actions: [
          {
            id: "action-1",
            type: "CREATE",
            scope: "global",
            timestampUtcMs: "123",
            input: {},
          },
        ],
        operations: [],
        createdAt: "123",
        queueHint: [],
        errorHistory: [],
        meta: { batchId: "test", batchJobIds: ["job-1"] },
      };

      // Create a mock handle with a spy on start()
      const startMock = vi.fn();
      const completeMock = vi.fn();
      const failMock = vi.fn();

      const mockHandle: IJobExecutionHandle = {
        job,
        state: JobQueueState.READY,
        start: startMock,
        complete: completeMock,
        fail: failMock,
      };

      // Mock the queue's dequeueNext to return our mock handle
      const originalDequeueNext = queue.dequeueNext.bind(queue);
      vi.spyOn(queue, "dequeueNext").mockImplementation(async (signal) => {
        // First call the original to remove the job from the queue
        await originalDequeueNext(signal);
        // Then return our mock handle instead
        return mockHandle;
      });

      await manager.start(1);
      await queue.enqueue(job);

      // Give the manager time to process
      await new Promise((resolve) => setTimeout(resolve, 100));

      // This should FAIL because start() is never called in the current implementation
      expect(startMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("model recovery", () => {
    function createMockModule(documentType: string): DocumentModelModule<any> {
      return {
        documentModel: {
          global: { id: documentType },
        },
        reducer: vi.fn(),
        utils: {},
      } as unknown as DocumentModelModule<any>;
    }

    it("should load missing model and retry job on ModuleNotFoundError", async () => {
      const registry = new DocumentModelRegistry();
      const mockModule = createMockModule("test/type");
      const loader: IDocumentModelLoader = {
        load: vi.fn().mockResolvedValue(mockModule),
      };
      const resolver = new DocumentModelResolver(registry, loader);

      const recoveryEventBus = new EventBus();
      const recoveryQueue = new InMemoryQueue(
        recoveryEventBus,
        new NullDocumentModelResolver(),
      );
      const recoveryJobTracker = new InMemoryJobTracker(recoveryEventBus);

      let callCount = 0;
      const mockExecutor: IJobExecutor = {
        executeJob: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return {
              success: false,
              error: new ModuleNotFoundError("test/type"),
            };
          }
          return { success: true, duration: 10 };
        }),
      };

      const recoveryManager = new SimpleJobExecutorManager(
        () => mockExecutor,
        recoveryEventBus,
        recoveryQueue,
        recoveryJobTracker,
        createMockLogger(),
        resolver,
      );

      await recoveryManager.start(1);

      const job = createTestJob({ id: "recovery-job" });
      await recoveryQueue.enqueue(job);

      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(loader.load).toHaveBeenCalledWith("test/type");
      expect(mockExecutor.executeJob).toHaveBeenCalledTimes(2);
      expect(registry.getModule("test/type")).toBe(mockModule);
    });

    it("should fall through to normal failure when model load fails", async () => {
      const registry = new DocumentModelRegistry();
      const loader: IDocumentModelLoader = {
        load: vi.fn().mockRejectedValue(new Error("Load failed")),
      };
      const resolver = new DocumentModelResolver(registry, loader);

      const recoveryEventBus = new EventBus();
      const recoveryQueue = new InMemoryQueue(
        recoveryEventBus,
        new NullDocumentModelResolver(),
      );
      const recoveryJobTracker = new InMemoryJobTracker(recoveryEventBus);

      const mockExecutor: IJobExecutor = {
        executeJob: vi.fn().mockResolvedValue({
          success: false,
          error: new ModuleNotFoundError("bad/type"),
        }),
      };

      const recoveryManager = new SimpleJobExecutorManager(
        () => mockExecutor,
        recoveryEventBus,
        recoveryQueue,
        recoveryJobTracker,
        createMockLogger(),
        resolver,
      );

      await recoveryManager.start(1);

      const job = createTestJob({
        id: "fail-job",
        retryCount: 0,
        maxRetries: 0,
      });
      await recoveryQueue.enqueue(job);

      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(loader.load).toHaveBeenCalledWith("bad/type");
      // Should not retry, just the one execution
      expect(mockExecutor.executeJob).toHaveBeenCalledTimes(1);
    });

    it("should cache failed model type across attempts", async () => {
      const registry = new DocumentModelRegistry();
      const loader: IDocumentModelLoader = {
        load: vi.fn().mockRejectedValue(new Error("Load failed")),
      };
      const resolver = new DocumentModelResolver(registry, loader);

      const recoveryEventBus = new EventBus();
      const recoveryQueue = new InMemoryQueue(
        recoveryEventBus,
        new NullDocumentModelResolver(),
      );
      const recoveryJobTracker = new InMemoryJobTracker(recoveryEventBus);

      const mockExecutor: IJobExecutor = {
        executeJob: vi.fn().mockResolvedValue({
          success: false,
          error: new ModuleNotFoundError("bad/type"),
        }),
      };

      const recoveryManager = new SimpleJobExecutorManager(
        () => mockExecutor,
        recoveryEventBus,
        recoveryQueue,
        recoveryJobTracker,
        createMockLogger(),
        resolver,
      );

      await recoveryManager.start(1);

      // First job
      const job1 = createTestJob({
        id: "cache-job-1",
        retryCount: 0,
        maxRetries: 0,
      });
      await recoveryQueue.enqueue(job1);
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Second job with same type
      const job2 = createTestJob({
        id: "cache-job-2",
        retryCount: 0,
        maxRetries: 0,
      });
      await recoveryQueue.enqueue(job2);
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Loader should only have been called once due to caching
      expect(loader.load).toHaveBeenCalledTimes(1);
    });

    it("should not intercept non-ModuleNotFoundError failures", async () => {
      const registry = new DocumentModelRegistry();
      const loader: IDocumentModelLoader = {
        load: vi.fn(),
      };
      const resolver = new DocumentModelResolver(registry, loader);

      const recoveryEventBus = new EventBus();
      const recoveryQueue = new InMemoryQueue(
        recoveryEventBus,
        new NullDocumentModelResolver(),
      );
      const recoveryJobTracker = new InMemoryJobTracker(recoveryEventBus);

      const mockExecutor: IJobExecutor = {
        executeJob: vi.fn().mockResolvedValue({
          success: false,
          error: new Error("Some other error"),
        }),
      };

      const recoveryManager = new SimpleJobExecutorManager(
        () => mockExecutor,
        recoveryEventBus,
        recoveryQueue,
        recoveryJobTracker,
        createMockLogger(),
        resolver,
      );

      await recoveryManager.start(1);

      const job = createTestJob({
        id: "other-error-job",
        retryCount: 0,
        maxRetries: 0,
      });
      await recoveryQueue.enqueue(job);

      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(loader.load).not.toHaveBeenCalled();
      expect(mockExecutor.executeJob).toHaveBeenCalledTimes(1);
    });

    it("should fall through when NullDocumentModelResolver is used", async () => {
      const nullResolverEventBus = new EventBus();
      const nullResolver = new NullDocumentModelResolver();
      const nullResolverQueue = new InMemoryQueue(
        nullResolverEventBus,
        nullResolver,
      );
      const nullResolverJobTracker = new InMemoryJobTracker(
        nullResolverEventBus,
      );

      const mockExecutor: IJobExecutor = {
        executeJob: vi.fn().mockResolvedValue({
          success: false,
          error: new ModuleNotFoundError("test/type"),
        }),
      };

      const nullResolverManager = new SimpleJobExecutorManager(
        () => mockExecutor,
        nullResolverEventBus,
        nullResolverQueue,
        nullResolverJobTracker,
        createMockLogger(),
        nullResolver,
      );

      await nullResolverManager.start(1);

      const job = createTestJob({
        id: "null-resolver-job",
        retryCount: 0,
        maxRetries: 0,
      });
      await nullResolverQueue.enqueue(job);

      await new Promise((resolve) => setTimeout(resolve, 200));

      // Should just process once and fail normally
      expect(mockExecutor.executeJob).toHaveBeenCalledTimes(1);
    });
  });
});
