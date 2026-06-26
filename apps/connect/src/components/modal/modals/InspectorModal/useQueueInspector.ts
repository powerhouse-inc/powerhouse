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
  const module = useReactorClientModule();
  const reactorClientModule = module?.kind === "browser" ? module : undefined;
  const inspector = module?.kind === "worker" ? module.inspector : undefined;
  const queue = reactorClientModule?.reactorModule?.queue;

  const inMemoryQueue = useMemo(() => {
    if (queue instanceof InMemoryQueue) {
      return queue;
    }
    return undefined;
  }, [queue]);

  const getQueueState = useCallback((): Promise<QueueState> => {
    if (inspector) {
      return inspector.getQueueState() as Promise<QueueState>;
    }
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
  }, [inMemoryQueue, inspector]);

  const onPause = useCallback(async (): Promise<void> => {
    if (inspector) {
      await inspector.pauseQueue();
      return;
    }
    if (inMemoryQueue) {
      inMemoryQueue.pause();
    }
  }, [inMemoryQueue, inspector]);

  const onResume = useCallback(async (): Promise<void> => {
    if (inspector) {
      await inspector.resumeQueue();
      return;
    }
    if (inMemoryQueue) {
      await inMemoryQueue.resume();
    }
  }, [inMemoryQueue, inspector]);

  if (!inMemoryQueue && !inspector) {
    return undefined;
  }

  return {
    getQueueState,
    onPause,
    onResume,
  };
}
