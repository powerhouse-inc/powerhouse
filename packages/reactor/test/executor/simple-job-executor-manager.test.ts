import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventBus } from "../../src/events/event-bus.js";
import type { IEventBus } from "../../src/events/interfaces.js";
import type { IJobExecutor } from "../../src/executor/interfaces.js";
import type { JobExecutorFactory } from "../../src/executor/simple-job-executor-manager.js";
import { SimpleJobExecutorManager } from "../../src/executor/simple-job-executor-manager.js";
import type { JobResult } from "../../src/executor/types.js";
import type { IQueue } from "../../src/queue/interfaces.js";
import { InMemoryQueue } from "../../src/queue/queue.js";
import type { Job } from "../../src/queue/types.js";

describe("SimpleJobExecutorManager", () => {
  let manager: SimpleJobExecutorManager;
  let mockExecutors: IJobExecutor[];
  let executorFactory: JobExecutorFactory;
  let eventBus: IEventBus;
  let queue: IQueue;

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
    queue = new InMemoryQueue(eventBus);

    // Create factory that returns mock executors
    executorFactory = vi.fn(() => createMockExecutor());

    manager = new SimpleJobExecutorManager(executorFactory, eventBus, queue);
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
        documentId: "doc-1",
        scope: "global",
        branch: "main",
        operation: {
          action: {
            id: "action-1",
            type: "CREATE",
            scope: "global",
            timestampUtcMs: "123",
            input: {},
          },
          index: 0,
          timestampUtcMs: "123",
          hash: "hash",
          skip: 0,
        },
        createdAt: "123",
        queueHint: [],
      };

      // Enqueue a job
      await queue.enqueue(job);

      // Give the manager time to process
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check that the executor was called
      expect(mockExecutors[0].executeJob).toHaveBeenCalledWith(job);
    });
  });
});
