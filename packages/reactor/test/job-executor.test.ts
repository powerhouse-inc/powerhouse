import { Operation } from "#shared/types.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventBus, type IEventBus } from "../src/events/event-bus.js";
import {
  InMemoryJobExecutor,
  JobExecutorEventTypes,
  type ExecutorStartedEvent,
  type ExecutorStoppedEvent,
  type IJobExecutor,
  type JobCompletedEvent,
  type JobExecutorConfig,
  type JobFailedEvent,
  type JobStartedEvent,
} from "../src/executor/job-executor.js";
import { InMemoryQueue, type IQueue, type Job } from "../src/queue/queue.js";

describe("InMemoryJobExecutor", () => {
  let executor: IJobExecutor;
  let eventBus: IEventBus;
  let queue: IQueue;
  let mockEventBusEmit: ReturnType<typeof vi.fn>;

  const createTestOperation = (
    overrides: Partial<Operation> = {},
  ): Operation => ({
    index: 1,
    timestamp: new Date().toISOString(),
    hash: "test-hash",
    skip: 0,
    type: "test-operation",
    input: { test: "data" },
    id: "op-1",
    ...overrides,
  });

  const createTestJob = (overrides: Partial<Job> = {}): Job => ({
    id: "job-1",
    documentId: "doc-1",
    scope: "global",
    branch: "main",
    operation: createTestOperation(),
    createdAt: new Date().toISOString(),
    retryCount: 0,
    maxRetries: 3,
    ...overrides,
  });

  beforeEach(() => {
    eventBus = new EventBus();
    mockEventBusEmit = vi.fn().mockResolvedValue(undefined);
    eventBus.emit = mockEventBusEmit;
    queue = new InMemoryQueue(eventBus);
    executor = new InMemoryJobExecutor(eventBus, queue);
  });

  describe("start", () => {
    it("should start the executor with default config", async () => {
      await executor.start();

      const status = await executor.getStatus();
      expect(status.isRunning).toBe(true);
      expect(status.activeJobs).toBe(0);
      expect(status.totalJobsProcessed).toBe(0);
    });

    it("should start the executor with custom config", async () => {
      const config: JobExecutorConfig = {
        maxConcurrency: 10,
        jobTimeout: 60000,
        retryBaseDelay: 2000,
        retryMaxDelay: 60000,
      };

      await executor.start(config);

      const status = await executor.getStatus();
      expect(status.isRunning).toBe(true);
    });

    it("should emit executor started event", async () => {
      await executor.start();

      expect(mockEventBusEmit).toHaveBeenCalledWith(
        JobExecutorEventTypes.EXECUTOR_STARTED,
        expect.objectContaining({
          config: expect.any(Object),
          startedAt: expect.any(String),
        }),
      );
    });

    it("should throw error if already running", async () => {
      await executor.start();

      await expect(executor.start()).rejects.toThrow(
        "Job executor is already running",
      );
    });

    it("should process existing jobs in queue on start", async () => {
      const realEventBus = new EventBus();
      const realQueue = new InMemoryQueue(realEventBus);
      const realExecutor = new InMemoryJobExecutor(realEventBus, realQueue);

      const job = createTestJob();
      await realQueue.enqueue(job);

      await realExecutor.start({ maxConcurrency: 1 });

      // Give time for job processing
      await new Promise((resolve) => setTimeout(resolve, 500));

      const status = await realExecutor.getStatus();
      expect(status.totalJobsProcessed).toBeGreaterThan(0);

      await realExecutor.stop();
    });
  });

  describe("stop", () => {
    beforeEach(async () => {
      await executor.start();
    });

    it("should stop the executor gracefully", async () => {
      await executor.stop(true);

      const status = await executor.getStatus();
      expect(status.isRunning).toBe(false);
    });

    it("should stop the executor non-gracefully", async () => {
      await executor.stop(false);

      const status = await executor.getStatus();
      expect(status.isRunning).toBe(false);
    });

    it("should emit executor stopped event", async () => {
      await executor.stop();

      expect(mockEventBusEmit).toHaveBeenCalledWith(
        JobExecutorEventTypes.EXECUTOR_STOPPED,
        expect.objectContaining({
          stoppedAt: expect.any(String),
          graceful: true,
        }),
      );
    });

    it("should handle stop when not running", async () => {
      await executor.stop();
      await expect(executor.stop()).resolves.not.toThrow();
    });

    it("should wait for active jobs when stopping gracefully", async () => {
      const job = createTestJob();
      await queue.enqueue(job);

      // Give some time for job to start
      await new Promise((resolve) => setTimeout(resolve, 50));

      const stopPromise = executor.stop(true);

      // Should eventually complete
      await expect(stopPromise).resolves.not.toThrow();
    });
  });

  describe("executeJob", () => {
    beforeEach(async () => {
      await executor.start();
    });

    afterEach(async () => {
      await executor.stop();
    });

    it("should execute a job successfully", async () => {
      const job = createTestJob();

      const result = await executor.executeJob(job);

      expect(result.success).toBe(true);
      expect(result.job).toEqual(job);
      expect(result.duration).toBeGreaterThan(0);
      expect(result.completedAt).toBeDefined();
      expect(result.metadata).toBeDefined();
    });

    it("should emit job started and completed events", async () => {
      const job = createTestJob();

      await executor.executeJob(job);

      expect(mockEventBusEmit).toHaveBeenCalledWith(
        JobExecutorEventTypes.JOB_STARTED,
        expect.objectContaining({
          job,
          startedAt: expect.any(String),
        }),
      );

      expect(mockEventBusEmit).toHaveBeenCalledWith(
        JobExecutorEventTypes.JOB_COMPLETED,
        expect.objectContaining({
          job,
          result: expect.any(Object),
        }),
      );
    });

    it("should handle job execution failure", async () => {
      const job = createTestJob();

      // Mock the performJobExecution to always fail
      const executorInstance = executor as InMemoryJobExecutor;
      const originalPerformJobExecution = (executorInstance as any)
        .performJobExecution;
      (executorInstance as any).performJobExecution = vi
        .fn()
        .mockRejectedValue(new Error("Test failure"));

      const result = await executor.executeJob(job);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Test failure");

      // Restore original method
      (executorInstance as any).performJobExecution =
        originalPerformJobExecution;
    });

    it("should emit job failed event on failure", async () => {
      const job = createTestJob();

      // Mock the performJobExecution to always fail
      const executorInstance = executor as InMemoryJobExecutor;
      (executorInstance as any).performJobExecution = vi
        .fn()
        .mockRejectedValue(new Error("Test failure"));

      await executor.executeJob(job);

      expect(mockEventBusEmit).toHaveBeenCalledWith(
        JobExecutorEventTypes.JOB_FAILED,
        expect.objectContaining({
          job,
          error: "Test failure",
          willRetry: true,
          retryCount: 0,
        }),
      );
    });

    it("should update statistics on job completion", async () => {
      const job = createTestJob();

      await executor.executeJob(job);

      const status = await executor.getStatus();
      expect(status.totalJobsProcessed).toBe(1);
      expect(status.totalJobsSucceeded).toBe(1);
      expect(status.totalJobsFailed).toBe(0);
      expect(status.lastJobCompletedAt).toBeDefined();
    });
  });

  describe("getStatus", () => {
    it("should return correct status when not running", async () => {
      const status = await executor.getStatus();

      expect(status.isRunning).toBe(false);
      expect(status.activeJobs).toBe(0);
      expect(status.totalJobsProcessed).toBe(0);
      expect(status.totalJobsSucceeded).toBe(0);
      expect(status.totalJobsFailed).toBe(0);
      expect(status.uptime).toBeUndefined();
    });

    it("should return correct status when running", async () => {
      await executor.start();

      const status = await executor.getStatus();

      expect(status.isRunning).toBe(true);
      expect(status.uptime).toBeGreaterThanOrEqual(0);

      await executor.stop();
    });

    it("should track active jobs correctly", async () => {
      await executor.start();

      const job1 = createTestJob({ id: "job-1" });
      const job2 = createTestJob({ id: "job-2" });

      // Start jobs concurrently
      const promise1 = executor.executeJob(job1);
      const promise2 = executor.executeJob(job2);

      // Check status while jobs are running
      const statusDuringExecution = await executor.getStatus();
      expect(statusDuringExecution.activeJobs).toBeGreaterThan(0);

      // Wait for jobs to complete
      await Promise.all([promise1, promise2]);

      // Check status after completion
      const statusAfterCompletion = await executor.getStatus();
      expect(statusAfterCompletion.activeJobs).toBe(0);

      await executor.stop();
    });
  });

  describe("getStats", () => {
    beforeEach(async () => {
      await executor.start();
    });

    afterEach(async () => {
      await executor.stop();
    });

    it("should return correct initial stats", async () => {
      const stats = await executor.getStats();

      expect(stats.averageExecutionTime).toBe(0);
      expect(stats.successRate).toBe(0);
      expect(stats.jobsPerSecond).toBe(0);
      expect(stats.queueBacklog).toBe(0);
    });

    it("should calculate stats correctly after job execution", async () => {
      const job = createTestJob();
      await executor.executeJob(job);

      const stats = await executor.getStats();

      expect(stats.averageExecutionTime).toBeGreaterThan(0);
      expect(stats.successRate).toBe(1);
      expect(stats.jobsPerSecond).toBeGreaterThan(0);
    });

    it("should include queue backlog in stats", async () => {
      const job1 = createTestJob({ id: "job-1" });
      const job2 = createTestJob({ id: "job-2" });

      await queue.enqueue(job1);
      await queue.enqueue(job2);

      const stats = await executor.getStats();
      expect(stats.queueBacklog).toBe(2);
    });
  });

  describe("pause and resume", () => {
    beforeEach(async () => {
      await executor.start();
    });

    afterEach(async () => {
      await executor.stop();
    });

    it("should pause job execution", async () => {
      await executor.pause();

      const job = createTestJob();
      await queue.enqueue(job);

      // Give some time to see if job gets processed
      await new Promise((resolve) => setTimeout(resolve, 100));

      const queueSize = await queue.totalSize();
      expect(queueSize).toBe(1); // Job should still be in queue
    });

    it("should resume job execution", async () => {
      await executor.pause();

      const job = createTestJob();
      await queue.enqueue(job);

      await executor.resume();

      // Give some time for job processing
      await new Promise((resolve) => setTimeout(resolve, 200));

      const queueSize = await queue.totalSize();
      expect(queueSize).toBe(0); // Job should be processed
    });
  });

  describe("event subscription", () => {
    let realEventBus: IEventBus;
    let realExecutor: IJobExecutor;

    beforeEach(async () => {
      // Use real event bus for event subscription tests
      realEventBus = new EventBus();
      const realQueue = new InMemoryQueue(realEventBus);
      realExecutor = new InMemoryJobExecutor(realEventBus, realQueue);
      await realExecutor.start();
    });

    afterEach(async () => {
      await realExecutor.stop();
    });

    it("should allow subscribing to job started events", async () => {
      const events: JobStartedEvent[] = [];
      const unsubscribe = realExecutor.on(
        "jobStarted",
        (data: JobStartedEvent) => {
          events.push(data);
        },
      );

      const job = createTestJob();
      await realExecutor.executeJob(job);

      expect(events).toHaveLength(1);
      expect(events[0].job).toEqual(job);

      unsubscribe();
    });

    it("should allow subscribing to job completed events", async () => {
      const events: JobCompletedEvent[] = [];
      const unsubscribe = realExecutor.on(
        "jobCompleted",
        (data: JobCompletedEvent) => {
          events.push(data);
        },
      );

      const job = createTestJob();
      await realExecutor.executeJob(job);

      expect(events).toHaveLength(1);
      expect(events[0].job).toEqual(job);
      expect(events[0].result.success).toBe(true);

      unsubscribe();
    });

    it("should allow subscribing to job failed events", async () => {
      const events: JobFailedEvent[] = [];
      const unsubscribe = realExecutor.on(
        "jobFailed",
        (data: JobFailedEvent) => {
          events.push(data);
        },
      );

      const job = createTestJob();

      // Mock the performJobExecution to always fail
      const executorInstance = realExecutor as InMemoryJobExecutor;
      (executorInstance as any).performJobExecution = vi
        .fn()
        .mockRejectedValue(new Error("Test failure"));

      await realExecutor.executeJob(job);

      expect(events).toHaveLength(1);
      expect(events[0].job).toEqual(job);
      expect(events[0].error).toBe("Test failure");

      unsubscribe();
    });

    it("should allow subscribing to executor started events", async () => {
      await realExecutor.stop();

      const events: ExecutorStartedEvent[] = [];
      const unsubscribe = realExecutor.on(
        "executorStarted",
        (data: ExecutorStartedEvent) => {
          events.push(data);
        },
      );

      await realExecutor.start();

      expect(events).toHaveLength(1);
      expect(events[0].config).toBeDefined();
      expect(events[0].startedAt).toBeDefined();

      unsubscribe();
    });

    it("should allow subscribing to executor stopped events", async () => {
      const events: ExecutorStoppedEvent[] = [];
      const unsubscribe = realExecutor.on(
        "executorStopped",
        (data: ExecutorStoppedEvent) => {
          events.push(data);
        },
      );

      await realExecutor.stop();

      expect(events).toHaveLength(1);
      expect(events[0].stoppedAt).toBeDefined();
      expect(events[0].graceful).toBe(true);

      unsubscribe();
    });

    it("should throw error for unknown event type", () => {
      expect(() => {
        realExecutor.on("unknownEvent" as any, () => {});
      }).toThrow("Unknown event type: unknownEvent");
    });
  });

  describe("concurrency control", () => {
    it("should respect maxConcurrency setting", async () => {
      const realEventBus = new EventBus();
      const realQueue = new InMemoryQueue(realEventBus);
      const realExecutor = new InMemoryJobExecutor(realEventBus, realQueue);

      await realExecutor.start({ maxConcurrency: 2 });

      const jobs = [
        createTestJob({ id: "job-1" }),
        createTestJob({ id: "job-2" }),
        createTestJob({ id: "job-3" }),
        createTestJob({ id: "job-4" }),
      ];

      // Enqueue all jobs
      for (const job of jobs) {
        await realQueue.enqueue(job);
      }

      // Give some time for processing to start
      await new Promise((resolve) => setTimeout(resolve, 50));

      const status = await realExecutor.getStatus();
      expect(status.activeJobs).toBeLessThanOrEqual(2);

      await realExecutor.stop();
    });

    it("should process jobs concurrently up to the limit", async () => {
      const realEventBus = new EventBus();
      const realQueue = new InMemoryQueue(realEventBus);
      const realExecutor = new InMemoryJobExecutor(realEventBus, realQueue);

      await realExecutor.start({ maxConcurrency: 3 });

      // Mock performJobExecution to take longer so we can observe concurrency
      const executorInstance = realExecutor as InMemoryJobExecutor;
      (executorInstance as any).performJobExecution = vi
        .fn()
        .mockImplementation(() => {
          return new Promise((resolve) =>
            setTimeout(() => resolve({ metadata: {} }), 200),
          );
        });

      const jobs = [
        createTestJob({ id: "job-1" }),
        createTestJob({ id: "job-2" }),
        createTestJob({ id: "job-3" }),
      ];

      // Enqueue all jobs
      for (const job of jobs) {
        await realQueue.enqueue(job);
      }

      // Give some time for processing to start
      await new Promise((resolve) => setTimeout(resolve, 50));

      const status = await realExecutor.getStatus();
      expect(status.activeJobs).toBe(3);

      await realExecutor.stop();
    });
  });

  describe("retry logic", () => {
    let realEventBus: IEventBus;
    let realQueue: IQueue;
    let realExecutor: IJobExecutor;

    beforeEach(async () => {
      // Use real event bus and queue for retry logic tests
      realEventBus = new EventBus();
      realQueue = new InMemoryQueue(realEventBus);
      realExecutor = new InMemoryJobExecutor(realEventBus, realQueue);
      await realExecutor.start({ retryBaseDelay: 10, retryMaxDelay: 100 });
    });

    afterEach(async () => {
      await realExecutor.stop();
    });

    it("should retry failed jobs", async () => {
      const job = createTestJob({ maxRetries: 2 });

      let callCount = 0;
      const executorInstance = realExecutor as InMemoryJobExecutor;
      (executorInstance as any).performJobExecution = vi
        .fn()
        .mockImplementation(() => {
          callCount++;
          if (callCount <= 2) {
            throw new Error("Simulated failure");
          }
          return Promise.resolve({ metadata: {} });
        });

      await realQueue.enqueue(job);

      // Give time for retries
      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(callCount).toBe(3); // Initial attempt + 2 retries
    });

    it("should respect maxRetries limit", async () => {
      const job = createTestJob({ maxRetries: 1 });

      let callCount = 0;
      const executorInstance = realExecutor as InMemoryJobExecutor;
      (executorInstance as any).performJobExecution = vi
        .fn()
        .mockImplementation(() => {
          callCount++;
          throw new Error("Always fails");
        });

      await realQueue.enqueue(job);

      // Give time for retries
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(callCount).toBe(2); // Initial attempt + 1 retry
    });

    it("should use exponential backoff for retries", async () => {
      const job = createTestJob({ maxRetries: 3 });

      const retryTimes: number[] = [];
      let callCount = 0;
      const executorInstance = realExecutor as InMemoryJobExecutor;
      (executorInstance as any).performJobExecution = vi
        .fn()
        .mockImplementation(() => {
          callCount++;
          retryTimes.push(Date.now());
          throw new Error("Always fails");
        });

      await realQueue.enqueue(job);

      // Give time for retries
      await new Promise((resolve) => setTimeout(resolve, 1000));

      expect(retryTimes.length).toBeGreaterThan(1);

      // Check that delays are increasing (exponential backoff)
      for (let i = 1; i < retryTimes.length - 1; i++) {
        const delay1 = retryTimes[i] - retryTimes[i - 1];
        const delay2 = retryTimes[i + 1] - retryTimes[i];
        expect(delay2).toBeGreaterThanOrEqual(delay1 * 0.9); // Allow for some jitter
      }
    });
  });

  describe("job timeout", () => {
    beforeEach(async () => {
      await executor.start({ jobTimeout: 100 });
    });

    afterEach(async () => {
      await executor.stop();
    });

    it("should timeout long-running jobs", async () => {
      const job = createTestJob();

      const executorInstance = executor as InMemoryJobExecutor;
      (executorInstance as any).performJobExecution = vi
        .fn()
        .mockImplementation(() => {
          return new Promise((resolve) => setTimeout(resolve, 200)); // Longer than timeout
        });

      const result = await executor.executeJob(job);

      expect(result.success).toBe(false);
      expect(result.error).toContain("timed out");
    });

    it("should complete jobs within timeout", async () => {
      const job = createTestJob();

      const executorInstance = executor as InMemoryJobExecutor;
      (executorInstance as any).performJobExecution = vi
        .fn()
        .mockImplementation(() => {
          return new Promise((resolve) =>
            setTimeout(() => resolve({ metadata: {} }), 50),
          ); // Within timeout
        });

      const result = await executor.executeJob(job);

      expect(result.success).toBe(true);
    });
  });

  describe("job abortion", () => {
    beforeEach(async () => {
      await executor.start();
    });

    afterEach(async () => {
      await executor.stop();
    });

    it("should abort jobs when stopping non-gracefully", async () => {
      const job = createTestJob();

      const executorInstance = executor as InMemoryJobExecutor;
      (executorInstance as any).performJobExecution = vi
        .fn()
        .mockImplementation((job, signal) => {
          return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => resolve({ metadata: {} }), 1000);
            signal.addEventListener("abort", () => {
              clearTimeout(timeout);
              reject(new Error("Job was aborted"));
            });
          });
        });

      // Start job execution
      const jobPromise = executor.executeJob(job);

      // Stop executor non-gracefully after a short delay
      setTimeout(() => executor.stop(false), 50);

      const result = await jobPromise;
      expect(result.success).toBe(false);
      expect(result.error).toContain("aborted");
    });
  });

  describe("edge cases", () => {
    it("should handle empty queue gracefully", async () => {
      await executor.start();

      // Give some time for processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      const status = await executor.getStatus();
      expect(status.activeJobs).toBe(0);

      await executor.stop();
    });

    it("should handle rapid start/stop cycles", async () => {
      for (let i = 0; i < 5; i++) {
        await executor.start();
        await executor.stop();
      }

      const status = await executor.getStatus();
      expect(status.isRunning).toBe(false);
    });

    it("should handle jobs with missing optional properties", async () => {
      await executor.start();

      const job: Job = {
        id: "minimal-job",
        documentId: "doc-1",
        scope: "global",
        branch: "main",
        operation: createTestOperation(),
        createdAt: new Date().toISOString(),
        // retryCount and maxRetries are optional
      };

      const result = await executor.executeJob(job);
      expect(result).toBeDefined();

      await executor.stop();
    });

    it("should handle event bus errors gracefully", async () => {
      mockEventBusEmit.mockRejectedValueOnce(new Error("Event bus error"));

      await expect(executor.start()).rejects.toThrow("Event bus error");
    });
  });
});
