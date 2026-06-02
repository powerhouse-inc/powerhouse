import type {
  QueueInspectorProps,
  QueueState,
} from "@powerhousedao/design-system/connect";
import {
  InMemoryQueue,
  useReactorClientModule,
  type Job,
} from "@powerhousedao/reactor-browser";
import { useCallback, useMemo } from "react";

export function useQueueInspector(): QueueInspectorProps | undefined {
  const reactorClientModule = useReactorClientModule();
  const queue = reactorClientModule?.reactorModule?.queue;

  const inMemoryQueue = useMemo(() => {
    if (queue instanceof InMemoryQueue) {
      return queue;
    }
    return undefined;
  }, [queue]);

  const getQueueState = useCallback((): Promise<QueueState> => {
    if (!inMemoryQueue) {
      return Promise.resolve({
        isPaused: false,
        pendingJobs: [],
        executingJobs: [],
        totalPending: 0,
        totalExecuting: 0,
      });
    }

    const pendingJobs = inMemoryQueue.getPendingJobs();
    const executingJobIds = inMemoryQueue.getExecutingJobIds();

    const executingJobs: Job[] = [];
    for (const jobIdSet of executingJobIds.values()) {
      for (const jobId of jobIdSet) {
        const job = inMemoryQueue.getJob(jobId);
        if (job) {
          executingJobs.push(job);
        }
      }
    }

    return Promise.resolve({
      isPaused: inMemoryQueue.paused,
      pendingJobs,
      executingJobs,
      totalPending: pendingJobs.length,
      totalExecuting: executingJobs.length,
    });
  }, [inMemoryQueue]);

  const onPause = useCallback((): Promise<void> => {
    if (inMemoryQueue) {
      inMemoryQueue.pause();
    }
    return Promise.resolve();
  }, [inMemoryQueue]);

  const onResume = useCallback(async (): Promise<void> => {
    if (inMemoryQueue) {
      await inMemoryQueue.resume();
    }
  }, [inMemoryQueue]);

  if (!inMemoryQueue) {
    return undefined;
  }

  return {
    getQueueState,
    onPause,
    onResume,
  };
}
