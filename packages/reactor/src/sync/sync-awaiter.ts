import type { IEventBus } from "../events/interfaces.js";
import type { Unsubscribe } from "../events/types.js";
import {
  SyncEventTypes,
  type SyncFailedEvent,
  type SyncResult,
  type SyncSucceededEvent,
} from "./types.js";

type SyncWaiter = {
  resolve: (value: SyncResult) => void;
  reject: (reason: Error) => void;
  signal?: AbortSignal;
};

/**
 * Provides a promise-based interface for waiting on sync completion.
 * Subscribes to sync events at construction and tracks completed sync results
 * to provide a fast path for jobs that have already synced.
 */
export class SyncAwaiter {
  private readonly completedResults = new Map<string, SyncResult>();
  private readonly pendingWaiters = new Map<string, SyncWaiter[]>();
  private readonly unsubscribers: Unsubscribe[] = [];
  private isShutdown = false;

  constructor(private readonly eventBus: IEventBus) {
    this.subscribeToEvents();
  }

  /**
   * Waits for sync operations for a job to complete.
   * Resolves when SYNC_SUCCEEDED is emitted.
   * Rejects when SYNC_FAILED is emitted.
   *
   * @param jobId - The job id to wait for
   * @param signal - Optional abort signal
   * @returns The sync result
   */
  waitForSync(jobId: string, signal?: AbortSignal): Promise<SyncResult> {
    if (signal?.aborted) {
      return Promise.reject(new Error("Operation aborted"));
    }

    if (this.isShutdown) {
      return Promise.reject(new Error("SyncAwaiter is shutdown"));
    }

    const completedResult = this.completedResults.get(jobId);
    if (completedResult) {
      return Promise.resolve(completedResult);
    }

    return new Promise<SyncResult>((resolve, reject) => {
      const waiter: SyncWaiter = { resolve, reject, signal };

      const existingWaiters = this.pendingWaiters.get(jobId) || [];
      existingWaiters.push(waiter);
      this.pendingWaiters.set(jobId, existingWaiters);

      if (signal) {
        const abortHandler = () => {
          const waiters = this.pendingWaiters.get(jobId);
          if (waiters) {
            const index = waiters.indexOf(waiter);
            if (index !== -1) {
              waiters.splice(index, 1);
              if (waiters.length === 0) {
                this.pendingWaiters.delete(jobId);
              }
              waiter.reject(new Error("Operation aborted"));
            }
          }
        };

        signal.addEventListener("abort", abortHandler, { once: true });
      }
    });
  }

  /**
   * Shuts down the sync awaiter. This will synchronously reject all pending waiters.
   */
  shutdown(): void {
    this.isShutdown = true;

    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.unsubscribers.length = 0;

    for (const [, waiters] of this.pendingWaiters) {
      for (const waiter of waiters) {
        waiter.reject(new Error("SyncAwaiter shutdown"));
      }
    }
    this.pendingWaiters.clear();
  }

  private subscribeToEvents(): void {
    this.unsubscribers.push(
      this.eventBus.subscribe<SyncSucceededEvent>(
        SyncEventTypes.SYNC_SUCCEEDED,
        (_type, event) => {
          this.handleSyncSucceeded(event);
        },
      ),
    );

    this.unsubscribers.push(
      this.eventBus.subscribe<SyncFailedEvent>(
        SyncEventTypes.SYNC_FAILED,
        (_type, event) => {
          this.handleSyncFailed(event);
        },
      ),
    );
  }

  private handleSyncSucceeded(event: SyncSucceededEvent): void {
    const result: SyncResult = {
      jobId: event.jobId,
      status: "succeeded",
      syncOperationCount: event.syncOperationCount,
      successCount: event.syncOperationCount,
      failureCount: 0,
      errors: [],
    };

    this.completedResults.set(event.jobId, result);
    this.resolveWaiters(event.jobId, result);
  }

  private handleSyncFailed(event: SyncFailedEvent): void {
    const result: SyncResult = {
      jobId: event.jobId,
      status: "failed",
      syncOperationCount: event.successCount + event.failureCount,
      successCount: event.successCount,
      failureCount: event.failureCount,
      errors: event.errors,
    };

    this.completedResults.set(event.jobId, result);
    this.resolveWaiters(event.jobId, result);
  }

  private resolveWaiters(jobId: string, result: SyncResult): void {
    const waiters = this.pendingWaiters.get(jobId);
    if (!waiters || waiters.length === 0) {
      return;
    }

    this.pendingWaiters.delete(jobId);

    for (const waiter of waiters) {
      if (waiter.signal?.aborted) {
        waiter.reject(new Error("Operation aborted"));
      } else {
        waiter.resolve(result);
      }
    }
  }
}
