import type { IJobExecutor, IJobExecutorManager } from "./interfaces.js";
import type { JobExecutorConfig } from "./types.js";

/**
 * Factory function type for creating job executor instances
 */
export type JobExecutorFactory = () => IJobExecutor;

/**
 * Default configuration for the executor manager
 */
const DEFAULT_CONFIG: Required<JobExecutorConfig> = {
  maxConcurrency: 5,
  jobTimeoutMs: 30000, // 30 seconds
  retryBaseDelayMs: 1000, // 1 second
  retryMaxDelayMs: 30000, // 30 seconds
};

/**
 * Implementation of IJobExecutorManager that manages multiple job executor instances.
 * Coordinates job distribution across multiple workers for parallel processing.
 */
export class JobExecutorManager implements IJobExecutorManager {
  private executors: IJobExecutor[] = [];
  private config: Required<JobExecutorConfig> = DEFAULT_CONFIG;
  private isRunning = false;

  constructor(private executorFactory: JobExecutorFactory) {}

  /**
   * Start the executor manager with specified number of executors.
   */
  async start(numExecutors: number, config?: JobExecutorConfig): Promise<void> {
    if (this.isRunning) {
      throw new Error("JobExecutorManager is already running");
    }

    if (numExecutors < 1) {
      throw new Error("Number of executors must be at least 1");
    }

    this.config = { ...DEFAULT_CONFIG, ...config };

    // Create and start executor instances
    for (let i = 0; i < numExecutors; i++) {
      const executor = this.executorFactory();
      await executor.start(this.config);
      this.executors.push(executor);
    }

    this.isRunning = true;
  }

  /**
   * Stop all managed executors.
   */
  async stop(graceful = true): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    // Stop all executors in parallel
    const stopPromises = this.executors.map((executor) =>
      executor.stop(graceful),
    );

    await Promise.all(stopPromises);

    this.executors = [];
    this.isRunning = false;
  }

  /**
   * Get all managed executor instances.
   */
  getExecutors(): IJobExecutor[] {
    return [...this.executors];
  }

  /**
   * Get a specific executor by index.
   */
  getExecutor(index: number): IJobExecutor | undefined {
    return this.executors[index];
  }

  /**
   * Scale the number of executors up or down.
   */
  async scale(numExecutors: number): Promise<void> {
    if (numExecutors < 1) {
      throw new Error("Number of executors must be at least 1");
    }

    const currentCount = this.executors.length;

    if (numExecutors === currentCount) {
      return; // No change needed
    }

    if (numExecutors > currentCount) {
      // Scale up - add more executors
      const toAdd = numExecutors - currentCount;
      for (let i = 0; i < toAdd; i++) {
        const executor = this.executorFactory();
        if (this.isRunning) {
          await executor.start(this.config);
        }
        this.executors.push(executor);
      }
    } else {
      // Scale down - remove executors
      const toRemove = currentCount - numExecutors;
      const removedExecutors = this.executors.splice(-toRemove);

      // Stop removed executors gracefully
      const stopPromises = removedExecutors.map((executor) =>
        executor.stop(true),
      );
      await Promise.all(stopPromises);
    }
  }

  /**
   * Get aggregate status across all executors.
   */
  async getStatus(): Promise<{
    numExecutors: number;
    totalActiveJobs: number;
    totalJobsProcessed: number;
    totalJobsSucceeded: number;
    totalJobsFailed: number;
    executorStatuses: Array<{
      index: number;
      isRunning: boolean;
      activeJobs: number;
    }>;
  }> {
    const statuses = await Promise.all(
      this.executors.map((executor) => executor.getStatus()),
    );

    const executorStatuses = statuses.map((status, index) => ({
      index,
      isRunning: status.isRunning,
      activeJobs: status.activeJobs,
    }));

    const aggregated = statuses.reduce(
      (acc, status) => ({
        totalActiveJobs: acc.totalActiveJobs + status.activeJobs,
        totalJobsProcessed: acc.totalJobsProcessed + status.totalJobsProcessed,
        totalJobsSucceeded: acc.totalJobsSucceeded + status.totalJobsSucceeded,
        totalJobsFailed: acc.totalJobsFailed + status.totalJobsFailed,
      }),
      {
        totalActiveJobs: 0,
        totalJobsProcessed: 0,
        totalJobsSucceeded: 0,
        totalJobsFailed: 0,
      },
    );

    return {
      numExecutors: this.executors.length,
      ...aggregated,
      executorStatuses,
    };
  }

  /**
   * Pause all executors.
   */
  async pauseAll(): Promise<void> {
    const pausePromises = this.executors.map((executor) => executor.pause());
    await Promise.all(pausePromises);
  }

  /**
   * Resume all executors.
   */
  async resumeAll(): Promise<void> {
    const resumePromises = this.executors.map((executor) => executor.resume());
    await Promise.all(resumePromises);
  }
}
