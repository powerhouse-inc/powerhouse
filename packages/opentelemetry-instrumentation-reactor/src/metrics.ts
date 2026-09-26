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
    executorTotalProcessed: meter.createCounter("reactor.executor.processed", {
      description: "Total jobs processed",
      unit: "{job}",
    }),
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
    readmodelCoordinatorChainDepth: meter.createObservableGauge(
      "reactor.readmodel.coordinator.chain_depth",
      {
        description:
          "In-flight per-queueKey projection chains in the coordinator",
        unit: "{chain}",
      },
    ),
    readmodelCoordinatorStageDuration: meter.createHistogram(
      "reactor.readmodel.coordinator.stage.duration",
      {
        description:
          "Wall time per stage in ReadModelCoordinator.runChain (pre_ready, emit, post_ready)",
        unit: "ms",
      },
    ),
    readmodelIndexingDuration: meter.createHistogram(
      "reactor.readmodel.indexing.duration",
      {
        description:
          "Per-read-model indexing duration within a coordinator chain",
        unit: "ms",
      },
    ),
    readmodelCoordinatorBatchSize: meter.createHistogram(
      "reactor.readmodel.coordinator.batch.size",
      {
        description: "Operations per batch processed by the coordinator chain",
        unit: "{operation}",
      },
    ),
    readmodelCoordinatorChainWaitDuration: meter.createHistogram(
      "reactor.readmodel.coordinator.chain.wait_duration",
      {
        description:
          "Time a batch sat in the per-queueKey chain before runChain started",
        unit: "ms",
      },
    ),

    // Postgres pool metrics
    dbPoolAcquireWaitDuration: meter.createHistogram(
      "reactor.db.pool.acquire.wait_duration",
      {
        description:
          "Time spent waiting for a pg.Pool to hand out a client (pool.connect resolve latency)",
        unit: "ms",
      },
    ),
    dbPoolSize: meter.createObservableGauge("reactor.db.pool.size", {
      description: "pg.Pool totalCount — connections currently open",
      unit: "{connection}",
    }),
    dbPoolIdle: meter.createObservableGauge("reactor.db.pool.idle", {
      description: "pg.Pool idleCount — open connections not currently in use",
      unit: "{connection}",
    }),
    dbPoolWaiting: meter.createObservableGauge("reactor.db.pool.waiting", {
      description:
        "pg.Pool waitingCount — callers queued waiting to acquire a connection",
      unit: "{request}",
    }),

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

    // Read-side catch-up metrics
    catchupSequenceHead: meter.createObservableGauge(
      "reactor.catchup.sequence_head",
      {
        description: "Highest ordinal the index sequence has handed out",
        unit: "{ordinal}",
      },
    ),
    catchupSettledThrough: meter.createObservableGauge(
      "reactor.catchup.settled_through",
      {
        description:
          "Every ordinal at or below this is visible or will never exist",
        unit: "{ordinal}",
      },
    ),
    catchupSettleLag: meter.createObservableGauge(
      "reactor.catchup.settle_lag",
      {
        description: "Sequence head minus the settled watermark",
        unit: "{ordinal}",
      },
    ),
    catchupConsumerLag: meter.createObservableGauge(
      "reactor.catchup.consumer_lag",
      {
        description: "Settled watermark minus a consumer's applied cursor",
        unit: "{ordinal}",
      },
    ),
    catchupSweepDuration: meter.createHistogram(
      "reactor.catchup.sweep.duration",
      {
        description: "Wall time of a catch-up sweep that moved or replayed",
        unit: "ms",
      },
    ),
    catchupSweepReplayed: meter.createCounter(
      "reactor.catchup.sweep.replayed",
      {
        description: "Operations a sweep applied that the live path never did",
        unit: "{operation}",
      },
    ),
    catchupSweepFailures: meter.createCounter(
      "reactor.catchup.sweep.failures",
      {
        description: "Sweeps that could not apply an operation",
        unit: "{sweep}",
      },
    ),

    // Signature metrics
    signatureRefusals: meter.createCounter("reactor.signature.refusals", {
      description:
        "Writes that failed signature admission, refused or (in log mode) admitted",
      unit: "{operation}",
    }),
  };
}

export type ReactorMetrics = ReturnType<typeof createMetrics>;
