import { ReactorEventTypes, SyncEventTypes } from "@powerhousedao/reactor";
import type {
  DeadLetterAddedEvent,
  IEventBus,
  IJobExecutorManager,
  IQueue,
  JobPendingEvent,
  JobReadReadyEvent,
  JobRunningEvent,
  JobWriteReadyEvent,
  ReactorJobFailedEvent,
  ReactorModule,
  SyncModule,
  Unsubscribe,
} from "@powerhousedao/reactor";
import { createMetrics, type ReactorMetrics } from "./metrics.js";

export class ReactorInstrumentation {
  private readonly module: ReactorModule;
  private metrics: ReactorMetrics | undefined;
  private unsubscribes: Unsubscribe[] = [];

  private pendingTimestamps = new Map<string, number>();
  private runningTimestamps = new Map<string, number>();
  private writeReadyTimestamps = new Map<string, number>();

  constructor(module: ReactorModule) {
    this.module = module;
  }

  start(): void {
    this.metrics = createMetrics();
    const { eventBus, queue, executorManager, syncModule } = this.module;

    this.subscribeJobPending(eventBus);
    this.subscribeJobRunning(eventBus);
    this.subscribeJobWriteReady(eventBus);
    this.subscribeJobReadReady(eventBus);
    this.subscribeJobFailed(eventBus);
    this.subscribeDeadLetterAdded(eventBus);
    this.registerObservableGauges(queue, executorManager, syncModule);
  }

  stop(): void {
    for (const unsub of this.unsubscribes) {
      unsub();
    }
    this.unsubscribes = [];
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
          const runningTs = this.runningTimestamps.get(event.jobId);
          if (runningTs !== undefined) {
            this.metrics.executorJobDuration.record(
              performance.now() - runningTs,
              { "job.success": "true" },
            );
          }
          this.metrics.executorTotalProcessed.add(1, {
            "job.success": "true",
          });
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
          this.metrics.executorTotalProcessed.add(1, {
            "job.success": "false",
          });
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
    syncModule: SyncModule | undefined,
  ): void {
    this.metrics!.queueDepth.addCallback(async (result) => {
      if (!this.metrics) return;
      // queue.totalSize() is async (DB query). The OTel SDK expects observable
      // callbacks to complete within the collection window; if this is slow
      // under DB load the observation may be silently dropped for that scrape.
      const depth = await queue.totalSize();
      result.observe(depth);
    });

    this.metrics!.executorActiveJobs.addCallback((result) => {
      if (!this.metrics) return;
      const status = executorManager.getStatus();
      result.observe(status.activeJobs);
    });

    this.metrics!.syncRemotes.addCallback((result) => {
      if (!this.metrics) return;
      const count = syncModule?.syncManager.list().length ?? 0;
      result.observe(count);
    });
  }

  private cleanup(jobId: string): void {
    this.pendingTimestamps.delete(jobId);
    this.runningTimestamps.delete(jobId);
    this.writeReadyTimestamps.delete(jobId);
  }
}
