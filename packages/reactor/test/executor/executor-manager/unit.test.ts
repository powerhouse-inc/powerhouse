import type { DocumentModelModule } from "document-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventBus } from "../../../src/events/event-bus.js";
import type { IEventBus } from "../../../src/events/interfaces.js";
import {
  ReactorEventTypes,
  type JobFailedEvent,
} from "../../../src/events/types.js";
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
import { DocumentNotFoundError } from "../../../src/shared/errors.js";
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
        defer: vi.fn(),
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

    it("should not intercept DocumentNotFoundError failures", async () => {
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
          error: new DocumentNotFoundError("missing-doc"),
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
        id: "doc-not-found-job",
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

  describe("out-of-order operation recovery", () => {
    it("should not waste retries on DocumentNotFoundError", async () => {
      const noRetryEventBus = new EventBus();
      const noRetryQueue = new InMemoryQueue(
        noRetryEventBus,
        new NullDocumentModelResolver(),
      );
      const noRetryJobTracker = new InMemoryJobTracker(noRetryEventBus);

      const mockExecutor: IJobExecutor = {
        executeJob: vi.fn().mockResolvedValue({
          success: false,
          error: new DocumentNotFoundError("missing-doc"),
        }),
      };

      const noRetryManager = new SimpleJobExecutorManager(
        () => mockExecutor,
        noRetryEventBus,
        noRetryQueue,
        noRetryJobTracker,
        createMockLogger(),
        new NullDocumentModelResolver(),
      );

      await noRetryManager.start(1);

      const job = createTestJob({
        id: "no-retry-job",
        documentId: "missing-doc",
        scope: "global",
        retryCount: 0,
        maxRetries: 3,
      });
      await noRetryQueue.enqueue(job);

      // Wait for processing to complete (job is deferred, not retried)
      await new Promise((resolve) => setTimeout(resolve, 200));

      // DocumentNotFoundError should execute only once — no retries consumed.
      expect(mockExecutor.executeJob).toHaveBeenCalledTimes(1);

      // The deferred job emits JOB_FAILED on stop()
      const failedPromise = new Promise<JobFailedEvent>((resolve) => {
        noRetryEventBus.subscribe(
          ReactorEventTypes.JOB_FAILED,
          (_type: number, data: JobFailedEvent) => {
            resolve(data);
          },
        );
      });
      await noRetryManager.stop(true);
      const failedEvent = await failedPromise;
      expect(failedEvent.jobId).toBe("no-retry-job");
    });

    it("should recover when operations arrive before CREATE_DOCUMENT", async () => {
      const oooEventBus = new EventBus();
      const oooQueue = new InMemoryQueue(
        oooEventBus,
        new NullDocumentModelResolver(),
      );
      const oooJobTracker = new InMemoryJobTracker(oooEventBus);

      // Track which documents have been "created" (simulates CREATE_DOCUMENT completing)
      const createdDocuments = new Set<string>();

      const mockExecutor: IJobExecutor = {
        executeJob: vi.fn().mockImplementation((job: Job) => {
          // CREATE_DOCUMENT always succeeds and registers the document
          if (job.scope === "document") {
            createdDocuments.add(job.documentId);
            return { success: true, duration: 10 };
          }

          // Global-scope actions fail with DocumentNotFoundError until document exists
          if (!createdDocuments.has(job.documentId)) {
            return {
              success: false,
              error: new DocumentNotFoundError(job.documentId),
            };
          }

          return { success: true, duration: 10 };
        }),
      };

      const oooManager = new SimpleJobExecutorManager(
        () => mockExecutor,
        oooEventBus,
        oooQueue,
        oooJobTracker,
        createMockLogger(),
        new NullDocumentModelResolver(),
      );

      const failedJobIds: string[] = [];

      oooEventBus.subscribe(
        ReactorEventTypes.JOB_FAILED,
        (_type: number, data: JobFailedEvent) => {
          failedJobIds.push(data.jobId);
        },
      );

      await oooManager.start(1);

      // Job 1: global-scope action arrives BEFORE CREATE_DOCUMENT
      const setNameJob = createTestJob({
        id: "set-name-job",
        documentId: "doc-1",
        scope: "global",
        retryCount: 0,
        maxRetries: 3,
      });
      await oooQueue.enqueue(setNameJob);

      // Small delay to let the first job start processing (and fail once)
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Job 2: CREATE_DOCUMENT arrives after the global action
      const createJob = createTestJob({
        id: "create-job",
        documentId: "doc-1",
        scope: "document",
        actions: [
          {
            id: "create-action",
            type: "CREATE_DOCUMENT",
            scope: "document",
            timestampUtcMs: "100",
            input: { documentId: "doc-1" },
          },
        ],
        retryCount: 0,
        maxRetries: 0,
      });
      await oooQueue.enqueue(createJob);

      // Wait for all processing to settle
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await oooManager.stop(true);

      // The SET_NAME job should NOT have failed permanently.
      // It should have eventually succeeded after CREATE_DOCUMENT completed.
      expect(failedJobIds).not.toContain("set-name-job");
    });
  });

  describe("document not found error classification", () => {
    it("should emit JOB_FAILED with DocumentNotFoundError when document does not exist", async () => {
      const failedEventBus = new EventBus();
      const failedQueue = new InMemoryQueue(
        failedEventBus,
        new NullDocumentModelResolver(),
      );
      const failedJobTracker = new InMemoryJobTracker(failedEventBus);

      const mockExecutor: IJobExecutor = {
        executeJob: vi.fn().mockResolvedValue({
          success: false,
          error: new DocumentNotFoundError("missing-doc"),
        }),
      };

      const failedManager = new SimpleJobExecutorManager(
        () => mockExecutor,
        failedEventBus,
        failedQueue,
        failedJobTracker,
        createMockLogger(),
        new NullDocumentModelResolver(),
      );

      await failedManager.start(1);

      const job = createTestJob({
        id: "doc-not-found-job",
        retryCount: 0,
        maxRetries: 0,
      });
      await failedQueue.enqueue(job);

      // Wait for processing (job is deferred, not failed yet)
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Subscribe before stop() to capture the deferred JOB_FAILED
      const failedPromise = new Promise<JobFailedEvent>((resolve) => {
        failedEventBus.subscribe(
          ReactorEventTypes.JOB_FAILED,
          (_type: number, data: JobFailedEvent) => {
            resolve(data);
          },
        );
      });
      await failedManager.stop(true);

      const failedEvent = await failedPromise;
      expect(failedEvent.error).toBeInstanceOf(DocumentNotFoundError);
      expect((failedEvent.error as DocumentNotFoundError).documentId).toBe(
        "doc-1",
      );
    });

    it("should distinguish DocumentNotFoundError from other failures", async () => {
      const classifyEventBus = new EventBus();
      const classifyQueue = new InMemoryQueue(
        classifyEventBus,
        new NullDocumentModelResolver(),
      );
      const classifyJobTracker = new InMemoryJobTracker(classifyEventBus);

      let callCount = 0;
      const mockExecutor: IJobExecutor = {
        executeJob: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return {
              success: false,
              error: new DocumentNotFoundError("missing-doc"),
            };
          }
          return {
            success: false,
            error: new Error("generic failure"),
          };
        }),
      };

      const classifyManager = new SimpleJobExecutorManager(
        () => mockExecutor,
        classifyEventBus,
        classifyQueue,
        classifyJobTracker,
        createMockLogger(),
        new NullDocumentModelResolver(),
      );

      const failedEvents: JobFailedEvent[] = [];
      classifyEventBus.subscribe(
        ReactorEventTypes.JOB_FAILED,
        (_type: number, data: JobFailedEvent) => {
          failedEvents.push(data);
        },
      );

      await classifyManager.start(1);

      const job1 = createTestJob({
        id: "classify-job-1",
        retryCount: 0,
        maxRetries: 0,
      });
      await classifyQueue.enqueue(job1);

      const job2 = createTestJob({
        id: "classify-job-2",
        retryCount: 0,
        maxRetries: 0,
      });
      await classifyQueue.enqueue(job2);

      // Wait for processing: job1 (DocumentNotFoundError) is deferred,
      // job2 (generic) emits JOB_FAILED from both manager and queue
      await new Promise((resolve) => setTimeout(resolve, 200));
      const genericEvents = failedEvents.filter(
        (e) => e.jobId === "classify-job-2",
      );
      expect(genericEvents.length).toBeGreaterThanOrEqual(1);
      expect(
        genericEvents.every((e) => !DocumentNotFoundError.isError(e.error)),
      ).toBe(true);

      // Stop the manager to flush the deferred DocumentNotFoundError job
      await classifyManager.stop(true);
      const deferredEvents = failedEvents.filter(
        (e) => e.jobId === "classify-job-1",
      );
      expect(deferredEvents.length).toBeGreaterThanOrEqual(1);
      expect(
        deferredEvents.some((e) => DocumentNotFoundError.isError(e.error)),
      ).toBe(true);
    });
  });
});
