import { metrics } from "@opentelemetry/api";

const METER_NAME = "@powerhousedao/reactor";

export function createMetrics() {
  const meter = metrics.getMeter(METER_NAME);

  return {
    // Queue metrics
    queueJobsEnqueued: meter.createCounter("reactor.queue.jobs.enqueued", {
      description: "Jobs enqueued",
      unit: "{job}",
    }),
    queueJobsDequeued: meter.createCounter("reactor.queue.jobs.dequeued", {
      description: "Jobs dequeued for execution",
      unit: "{job}",
    }),
    queueJobsCompleted: meter.createCounter("reactor.queue.jobs.completed", {
      description: "Jobs completed (READ_READY)",
      unit: "{job}",
    }),
    queueJobsFailed: meter.createCounter("reactor.queue.jobs.failed", {
      description: "Jobs permanently failed",
      unit: "{job}",
    }),
    queueDepth: meter.createObservableGauge("reactor.queue.depth", {
      description: "Pending jobs across all queues",
      unit: "{job}",
    }),
    queueExecuting: meter.createObservableGauge("reactor.queue.executing", {
      description: "Jobs currently executing",
      unit: "{job}",
    }),

    // Executor metrics
    executorJobDuration: meter.createHistogram(
      "reactor.executor.job.duration",
      {
        description: "Job execution time (RUNNING to WRITE_READY)",
        unit: "ms",
      },
    ),
    executorActiveJobs: meter.createObservableGauge(
      "reactor.executor.active_jobs",
      {
        description: "Currently executing jobs",
        unit: "{job}",
      },
    ),
    executorTotalProcessed: meter.createCounter(
      "reactor.executor.total_processed",
      {
        description: "Total jobs processed",
        unit: "{job}",
      },
    ),
    executorOperationsGenerated: meter.createCounter(
      "reactor.executor.operations_generated",
      {
        description: "Operations produced by executors",
        unit: "{operation}",
      },
    ),

    // Job lifecycle metrics
    jobTotalDuration: meter.createHistogram("reactor.job.total.duration", {
      description: "Full job lifecycle (PENDING to READ_READY/FAILED)",
      unit: "ms",
    }),

    // Read model metrics
    readmodelIndexDuration: meter.createHistogram(
      "reactor.readmodel.index.duration",
      {
        description: "Read model indexing time (WRITE_READY to READ_READY)",
        unit: "ms",
      },
    ),

    // Event bus metrics
    eventbusEventsEmitted: meter.createCounter(
      "reactor.eventbus.events.emitted",
      {
        description: "Events emitted",
        unit: "{event}",
      },
    ),

    // Sync metrics
    syncRemotes: meter.createObservableGauge("reactor.sync.remotes", {
      description: "Active remote count",
      unit: "{remote}",
    }),
    syncDeadLettersAdded: meter.createCounter(
      "reactor.sync.dead_letters.added",
      {
        description: "Sync operations moved to dead letter storage",
        unit: "{operation}",
      },
    ),
  };
}

export type ReactorMetrics = ReturnType<typeof createMetrics>;
