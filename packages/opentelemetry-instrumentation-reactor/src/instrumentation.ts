import {
  JobExecutorEventTypes,
  ReactorEventTypes,
  SyncEventTypes,
} from "@powerhousedao/reactor";
import type {
  DeadLetterAddedEvent,
  IEventBus,
  IJobExecutorManager,
  IQueue,
  JobCompletedEvent,
  JobFailedEvent as ExecutorJobFailedEvent,
  JobPendingEvent,
  JobReadReadyEvent,
  JobRunningEvent,
  JobWriteReadyEvent,
  PoolInstrumentation,
  ReactorJobFailedEvent,
  ReadModelBatchCompletedEvent,
  ReadModelIndexedEvent,
  IReadModelCoordinator,
  InProcessReactorModule,
  SyncModule,
  Unsubscribe,
} from "@powerhousedao/reactor";
import type { ObservableCallback, ObservableGauge } from "@opentelemetry/api";
import { createMetrics, type ReactorMetrics } from "./metrics.js";

export class ReactorInstrumentation {
  private readonly module: InProcessReactorModule;
  private metrics: ReactorMetrics | undefined;
  private unsubscribes: Unsubscribe[] = [];
  private observableCallbacks: Array<[ObservableGauge, ObservableCallback]> =
    [];

  private pendingTimestamps = new Map<string, number>();
  private runningTimestamps = new Map<string, number>();
  private writeReadyTimestamps = new Map<string, number>();

  constructor(module: InProcessReactorModule) {
    this.module = module;
  }

  start(): void {
    this.metrics = createMetrics();
    const { eventBus, queue, executorManager, syncModule, pools } = this.module;

    this.subscribeJobPending(eventBus);
    this.subscribeJobRunning(eventBus);
    this.subscribeJobWriteReady(eventBus);
    this.subscribeJobReadReady(eventBus);
    this.subscribeJobFailed(eventBus);
    this.subscribeExecutorJobCompleted(eventBus);
    this.subscribeExecutorJobFailed(eventBus);
    this.subscribeDeadLetterAdded(eventBus);
    this.subscribeReadModelBatchCompleted(eventBus);
    this.subscribeReadModelIndexed(eventBus);
    this.registerObservableGauges(
      queue,
      executorManager,
      this.module.readModelCoordinator,
      syncModule,
    );
    this.registerPoolInstrumentation(pools);
  }

  stop(): void {
    for (const unsub of this.unsubscribes) {
      unsub();
    }
    this.unsubscribes = [];
    for (const [gauge, cb] of this.observableCallbacks) {
      gauge.removeCallback(cb);
    }
    this.observableCallbacks = [];
    this.pendingTimestamps.clear();
    this.runningTimestamps.clear();
    this.writeReadyTimestamps.clear();
    this.metrics = undefined;
  }

  private subscribeJobPending(eventBus: IEventBus): void {
    this.unsubscribes.push(
      eventBus.subscribe<JobPendingEvent>(
        ReactorEventTypes.JOB_PENDING,
        (_type, event) => {
          if (!this.metrics) return;
          this.metrics.queueJobsEnqueued.add(1);
          this.metrics.eventbusEventsEmitted.add(1, {
            "event.type": "JOB_PENDING",
          });
          this.pendingTimestamps.set(event.jobId, performance.now());
        },
      ),
    );
  }

  private subscribeJobRunning(eventBus: IEventBus): void {
    this.unsubscribes.push(
      eventBus.subscribe<JobRunningEvent>(
        ReactorEventTypes.JOB_RUNNING,
        (_type, event) => {
          if (!this.metrics) return;
          this.metrics.queueJobsDequeued.add(1);
          this.metrics.eventbusEventsEmitted.add(1, {
            "event.type": "JOB_RUNNING",
          });
          this.runningTimestamps.set(event.jobId, performance.now());
        },
      ),
    );
  }

  private subscribeJobWriteReady(eventBus: IEventBus): void {
    this.unsubscribes.push(
      eventBus.subscribe<JobWriteReadyEvent>(
        ReactorEventTypes.JOB_WRITE_READY,
        (_type, event) => {
          if (!this.metrics) return;
          this.metrics.executorOperationsGenerated.add(event.operations.length);
          this.metrics.eventbusEventsEmitted.add(1, {
            "event.type": "JOB_WRITE_READY",
          });
          this.writeReadyTimestamps.set(event.jobId, performance.now());
        },
      ),
    );
  }

  private subscribeJobReadReady(eventBus: IEventBus): void {
    this.unsubscribes.push(
      eventBus.subscribe<JobReadReadyEvent>(
        ReactorEventTypes.JOB_READ_READY,
        (_type, event) => {
          if (!this.metrics) return;
          const writeReadyTs = this.writeReadyTimestamps.get(event.jobId);
          if (writeReadyTs !== undefined) {
            this.metrics.readmodelIndexDuration.record(
              performance.now() - writeReadyTs,
            );
          }
          const pendingTs = this.pendingTimestamps.get(event.jobId);
          if (pendingTs !== undefined) {
            this.metrics.jobTotalDuration.record(
              performance.now() - pendingTs,
              { "job.success": "true" },
            );
          }
          this.metrics.queueJobsCompleted.add(1);
          this.metrics.eventbusEventsEmitted.add(1, {
            "event.type": "JOB_READ_READY",
          });
          this.cleanup(event.jobId);
        },
      ),
    );
  }

  private subscribeJobFailed(eventBus: IEventBus): void {
    this.unsubscribes.push(
      eventBus.subscribe<ReactorJobFailedEvent>(
        ReactorEventTypes.JOB_FAILED,
        (_type, event) => {
          if (!this.metrics) return;
          this.metrics.queueJobsFailed.add(1);
          const pendingTs = this.pendingTimestamps.get(event.jobId);
          if (pendingTs !== undefined) {
            this.metrics.jobTotalDuration.record(
              performance.now() - pendingTs,
              { "job.success": "false" },
            );
          }
          this.metrics.eventbusEventsEmitted.add(1, {
            "event.type": "JOB_FAILED",
          });
          this.cleanup(event.jobId);
        },
      ),
    );
  }

  private subscribeExecutorJobCompleted(eventBus: IEventBus): void {
    this.unsubscribes.push(
      eventBus.subscribe<JobCompletedEvent>(
        JobExecutorEventTypes.JOB_COMPLETED,
        (_type, event) => {
          if (!this.metrics) return;
          const workerId = event.workerId ?? "unknown";
          const jobId = event.job.id;
          const runningTs = this.runningTimestamps.get(jobId);
          if (runningTs !== undefined) {
            this.metrics.executorJobDuration.record(
              performance.now() - runningTs,
              { "job.success": "true", "worker.id": workerId },
            );
            this.runningTimestamps.delete(jobId);
          }
          this.metrics.executorTotalProcessed.add(1, {
            "job.success": "true",
            "worker.id": workerId,
          });
          this.metrics.eventbusEventsEmitted.add(1, {
            "event.type": "EXECUTOR_JOB_COMPLETED",
          });
        },
      ),
    );
  }

  private subscribeExecutorJobFailed(eventBus: IEventBus): void {
    this.unsubscribes.push(
      eventBus.subscribe<ExecutorJobFailedEvent>(
        JobExecutorEventTypes.JOB_FAILED,
        (_type, event) => {
          if (!this.metrics) return;
          const workerId = event.workerId ?? "unknown";
          const jobId = event.job.id;
          const runningTs = this.runningTimestamps.get(jobId);
          if (runningTs !== undefined) {
            this.metrics.executorJobDuration.record(
              performance.now() - runningTs,
              { "job.success": "false", "worker.id": workerId },
            );
            this.runningTimestamps.delete(jobId);
          }
          this.metrics.executorTotalProcessed.add(1, {
            "job.success": "false",
            "worker.id": workerId,
          });
          this.metrics.eventbusEventsEmitted.add(1, {
            "event.type": "EXECUTOR_JOB_FAILED",
          });
        },
      ),
    );
  }

  private subscribeReadModelBatchCompleted(eventBus: IEventBus): void {
    this.unsubscribes.push(
      eventBus.subscribe<ReadModelBatchCompletedEvent>(
        ReactorEventTypes.READMODEL_BATCH_COMPLETED,
        (_type, event) => {
          if (!this.metrics) return;
          this.metrics.readmodelCoordinatorChainWaitDuration.record(
            event.chainWaitDurationMs,
          );
          this.metrics.readmodelCoordinatorBatchSize.record(event.batchSize);
          this.metrics.readmodelCoordinatorStageDuration.record(
            event.preReadyDurationMs,
            { stage: "pre_ready" },
          );
          this.metrics.readmodelCoordinatorStageDuration.record(
            event.emitDurationMs,
            { stage: "emit" },
          );
          this.metrics.readmodelCoordinatorStageDuration.record(
            event.postReadyDurationMs,
            { stage: "post_ready" },
          );
          this.metrics.eventbusEventsEmitted.add(1, {
            "event.type": "READMODEL_BATCH_COMPLETED",
          });
        },
      ),
    );
  }

  private subscribeReadModelIndexed(eventBus: IEventBus): void {
    this.unsubscribes.push(
      eventBus.subscribe<ReadModelIndexedEvent>(
        ReactorEventTypes.READMODEL_INDEXED,
        (_type, event) => {
          if (!this.metrics) return;
          this.metrics.readmodelIndexingDuration.record(event.durationMs, {
            "read_model.name": event.readModelName,
            stage: event.stage,
            "indexing.success": event.success ? "true" : "false",
          });
          this.metrics.eventbusEventsEmitted.add(1, {
            "event.type": "READMODEL_INDEXED",
          });
        },
      ),
    );
  }

  private subscribeDeadLetterAdded(eventBus: IEventBus): void {
    this.unsubscribes.push(
      eventBus.subscribe<DeadLetterAddedEvent>(
        SyncEventTypes.DEAD_LETTER_ADDED,
        (_type, event) => {
          if (!this.metrics) return;
          this.metrics.syncDeadLettersAdded.add(1, {
            "remote.name": event.remoteName,
          });
          this.metrics.eventbusEventsEmitted.add(1, {
            "event.type": "DEAD_LETTER_ADDED",
          });
        },
      ),
    );
  }

  private registerObservableGauges(
    queue: IQueue,
    executorManager: IJobExecutorManager,
    readModelCoordinator: IReadModelCoordinator,
    syncModule: SyncModule | undefined,
  ): void {
    if (!this.metrics) return;

    const depthCb: ObservableCallback = async (result) => {
      if (!this.metrics) return;
      // queue.totalSize() is a DB query. If it exceeds the OTel collection
      // window the observation is silently dropped, making the gauge appear
      // to drop to zero under load. The timeout makes the failure explicit.
      const TIMEOUT_MS = 2_000;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      try {
        const depth = await Promise.race([
          queue.totalSize(),
          new Promise<never>((_, reject) => {
            timeoutId = setTimeout(
              () => reject(new Error("queue.totalSize() timed out")),
              TIMEOUT_MS,
            );
          }),
        ]);
        result.observe(depth);
      } catch (err) {
        console.warn(
          "[ReactorInstrumentation] queueDepth observation failed:",
          err,
        );
      } finally {
        clearTimeout(timeoutId);
      }
    };
    this.metrics.queueDepth.addCallback(depthCb);
    this.observableCallbacks.push([this.metrics.queueDepth, depthCb]);

    const activeJobsCb: ObservableCallback = (result) => {
      if (!this.metrics) return;
      const status = executorManager.getStatus();
      result.observe(status.activeJobs);
    };
    this.metrics.executorActiveJobs.addCallback(activeJobsCb);
    this.observableCallbacks.push([
      this.metrics.executorActiveJobs,
      activeJobsCb,
    ]);

    const chainDepthCb: ObservableCallback = (result) => {
      if (!this.metrics) return;
      result.observe(readModelCoordinator.getChainDepth());
    };
    this.metrics.readmodelCoordinatorChainDepth.addCallback(chainDepthCb);
    this.observableCallbacks.push([
      this.metrics.readmodelCoordinatorChainDepth,
      chainDepthCb,
    ]);

    const remotesCb: ObservableCallback = (result) => {
      if (!this.metrics) return;
      const count = syncModule?.syncManager.list().length ?? 0;
      result.observe(count);
    };
    this.metrics.syncRemotes.addCallback(remotesCb);
    this.observableCallbacks.push([this.metrics.syncRemotes, remotesCb]);
  }

  private registerPoolInstrumentation(pools: PoolInstrumentation[]): void {
    if (!this.metrics || pools.length === 0) return;

    for (const pool of pools) {
      const attrs = { pool: pool.name };
      const unsub = pool.onAcquire((durationMs) => {
        if (!this.metrics) return;
        this.metrics.dbPoolAcquireWaitDuration.record(durationMs, attrs);
      });
      this.unsubscribes.push(unsub);
    }

    const sizeCb: ObservableCallback = (result) => {
      if (!this.metrics) return;
      for (const pool of pools) {
        const stats = pool.getStats();
        result.observe(stats.size, { pool: pool.name });
      }
    };
    this.metrics.dbPoolSize.addCallback(sizeCb);
    this.observableCallbacks.push([this.metrics.dbPoolSize, sizeCb]);

    const idleCb: ObservableCallback = (result) => {
      if (!this.metrics) return;
      for (const pool of pools) {
        const stats = pool.getStats();
        result.observe(stats.idle, { pool: pool.name });
      }
    };
    this.metrics.dbPoolIdle.addCallback(idleCb);
    this.observableCallbacks.push([this.metrics.dbPoolIdle, idleCb]);

    const waitingCb: ObservableCallback = (result) => {
      if (!this.metrics) return;
      for (const pool of pools) {
        const stats = pool.getStats();
        result.observe(stats.waiting, { pool: pool.name });
      }
    };
    this.metrics.dbPoolWaiting.addCallback(waitingCb);
    this.observableCallbacks.push([this.metrics.dbPoolWaiting, waitingCb]);
  }

  private cleanup(jobId: string): void {
    this.pendingTimestamps.delete(jobId);
    this.runningTimestamps.delete(jobId);
    this.writeReadyTimestamps.delete(jobId);
  }
}
