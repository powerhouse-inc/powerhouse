import type { IEventBus } from "../events/interfaces.js";
import type { IQueue } from "../queue/interfaces.js";
import { QueueEventTypes, type JobAvailableEvent } from "../queue/types.js";
import type { IJobExecutor, IJobExecutorManager } from "./interfaces.js";

export type JobExecutorFactory = () => IJobExecutor;

/**
 * Manages multiple job executors and coordinates job distribution.
 * Listens for job available events and dispatches jobs to executors.
 */
export class SimpleJobExecutorManager implements IJobExecutorManager {
  private executors: IJobExecutor[] = [];
  private isRunning = false;
  private activeJobs = 0;
  private totalJobsProcessed = 0;
  private unsubscribe?: () => void;

  constructor(
    private executorFactory: JobExecutorFactory,
    private eventBus: IEventBus,
    private queue: IQueue,
  ) {}

  async start(numExecutors: number): Promise<void> {
    if (this.isRunning) {
      throw new Error("JobExecutorManager is already running");
    }

    if (numExecutors < 1) {
      throw new Error("Number of executors must be at least 1");
    }

    // Create executors
    this.executors = [];
    for (let i = 0; i < numExecutors; i++) {
      this.executors.push(this.executorFactory());
    }

    // Start listening for job available events
    this.unsubscribe = this.eventBus.subscribe(
      QueueEventTypes.JOB_AVAILABLE,
      async (type: number, event: JobAvailableEvent) => {
        // Only process if we have capacity (simple round-robin for now)
        if (this.activeJobs < this.executors.length) {
          await this.processNextJob();
        }
      },
    );

    this.isRunning = true;

    // Process any existing jobs in the queue
    await this.processExistingJobs();
  }

  async stop(graceful = true): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    // Stop listening for new jobs
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
    }

    if (graceful) {
      // Wait for active jobs to complete
      while (this.activeJobs > 0) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    this.executors = [];
    this.isRunning = false;
  }

  getExecutors(): IJobExecutor[] {
    return [...this.executors];
  }

  async getStatus(): Promise<{
    isRunning: boolean;
    numExecutors: number;
    activeJobs: number;
    totalJobsProcessed: number;
  }> {
    return {
      isRunning: this.isRunning,
      numExecutors: this.executors.length,
      activeJobs: this.activeJobs,
      totalJobsProcessed: this.totalJobsProcessed,
    };
  }

  private async processNextJob(): Promise<void> {
    try {
      // Dequeue next available job
      const job = await this.queue.dequeueNext();
      if (!job) {
        return;
      }

      this.activeJobs++;

      // Find an available executor (simple round-robin)
      const executorIndex = this.totalJobsProcessed % this.executors.length;
      const executor = this.executors[executorIndex];

      // Execute the job
      const result = await executor.executeJob(job);

      // Update job status in queue
      if (result.success) {
        await this.queue.completeJob(job.id);
      } else {
        // Handle retry logic
        const retryCount = job.retryCount || 0;
        const maxRetries = job.maxRetries || 0;
        if (retryCount < maxRetries) {
          await this.queue.retryJob(job.id, result.error?.message);
        } else {
          await this.queue.failJob(job.id, result.error?.message);
        }
      }

      this.totalJobsProcessed++;
    } catch (error) {
      console.error("Error processing job:", error);
    } finally {
      this.activeJobs--;

      // Check if there are more jobs to process
      if (this.isRunning) {
        const hasMore = await this.queue.hasJobs();
        if (hasMore) {
          await this.processNextJob();
        }
      }
    }
  }

  private async processExistingJobs(): Promise<void> {
    const hasJobs = await this.queue.hasJobs();
    if (hasJobs) {
      // Start processing up to the number of executors
      const promises: Promise<void>[] = [];
      for (let i = 0; i < Math.min(this.executors.length, 5); i++) {
        promises.push(this.processNextJob());
      }
      await Promise.all(promises);
    }
  }
}
