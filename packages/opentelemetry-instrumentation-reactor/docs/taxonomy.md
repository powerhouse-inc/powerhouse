# Reactor Metrics Taxonomy

All metrics use the meter name `@powerhousedao/reactor`.

## Units

Metric units follow the [OpenTelemetry Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/general/metrics/#instrument-units)
which use UCUM (Unified Code for Units of Measure). Curly-brace annotations like `{job}`, `{operation}`,
`{event}`, and `{remote}` denote dimensionless counts of a specific thing. Standard units like `ms`
(milliseconds) are used for durations.

## Queue (`reactor.queue.*`)

| Name                           | Type            | Unit    | Description                    | Attributes |
| ------------------------------ | --------------- | ------- | ------------------------------ | ---------- |
| `reactor.queue.jobs.enqueued`  | Counter         | `{job}` | Jobs enqueued                  |            |
| `reactor.queue.jobs.dequeued`  | Counter         | `{job}` | Jobs dequeued for execution    |            |
| `reactor.queue.jobs.completed` | Counter         | `{job}` | Jobs completed (READ_READY)    |            |
| `reactor.queue.jobs.failed`    | Counter         | `{job}` | Jobs permanently failed        |            |
| `reactor.queue.depth`          | ObservableGauge | `{job}` | Pending jobs across all queues |            |
| `reactor.queue.executing`      | ObservableGauge | `{job}` | Jobs currently executing       |            |

## Executor (`reactor.executor.*`)

| Name                                    | Type            | Unit          | Description                                 | Attributes                 |
| --------------------------------------- | --------------- | ------------- | ------------------------------------------- | -------------------------- |
| `reactor.executor.job.duration`         | Histogram       | `ms`          | Job execution time (RUNNING to WRITE_READY) | `job.success`              |
| `reactor.executor.active_jobs`          | ObservableGauge | `{job}`       | Currently executing jobs                    |                            |
| `reactor.executor.total_processed`      | Counter         | `{job}`       | Total jobs processed                        | `job.success` (true/false) |
| `reactor.executor.operations_generated` | Counter         | `{operation}` | Operations produced by executors            |                            |

## Job Lifecycle (`reactor.job.*`)

| Name                          | Type      | Unit | Description                                       | Attributes                 |
| ----------------------------- | --------- | ---- | ------------------------------------------------- | -------------------------- |
| `reactor.queue.wait.duration` | Histogram | `ms` | Queue wait time per job (PENDING to RUNNING)      |                            |
| `reactor.job.total.duration`  | Histogram | `ms` | Full job lifecycle (PENDING to READ_READY/FAILED) | `job.success` (true/false) |

## Read Models (`reactor.readmodel.*`)

| Name                               | Type      | Unit | Description                                          | Attributes |
| ---------------------------------- | --------- | ---- | ---------------------------------------------------- | ---------- |
| `reactor.readmodel.index.duration` | Histogram | `ms` | Read model indexing time (WRITE_READY to READ_READY) |            |

## Event Bus (`reactor.eventbus.*`)

| Name                              | Type    | Unit      | Description    | Attributes   |
| --------------------------------- | ------- | --------- | -------------- | ------------ |
| `reactor.eventbus.events.emitted` | Counter | `{event}` | Events emitted | `event.type` |

## Sync (`reactor.sync.*`)

| Name                              | Type            | Unit          | Description                                  | Attributes    |
| --------------------------------- | --------------- | ------------- | -------------------------------------------- | ------------- |
| `reactor.sync.remotes`            | ObservableGauge | `{remote}`    | Active remote count                          |               |
| `reactor.sync.dead_letters.added` | Counter         | `{operation}` | Sync operations moved to dead letter storage | `remote.name` |

## Event Types Tracked

| Event               | Code  | Metrics Recorded                                                                                                |
| ------------------- | ----- | --------------------------------------------------------------------------------------------------------------- |
| `JOB_PENDING`       | 10001 | `queue.jobs.enqueued`, `eventbus.events.emitted`                                                                |
| `JOB_RUNNING`       | 10002 | `queue.jobs.dequeued`, `queue.wait.duration`, `eventbus.events.emitted`                                         |
| `JOB_WRITE_READY`   | 10003 | `executor.job.duration`, `executor.total_processed`, `executor.operations_generated`, `eventbus.events.emitted` |
| `JOB_READ_READY`    | 10004 | `readmodel.index.duration`, `job.total.duration`, `queue.jobs.completed`, `eventbus.events.emitted`             |
| `JOB_FAILED`        | 10005 | `queue.jobs.failed`, `executor.total_processed`, `job.total.duration`, `eventbus.events.emitted`                |
| `DEAD_LETTER_ADDED` | 20004 | `sync.dead_letters.added`, `eventbus.events.emitted`                                                            |

## Environment Variables

| Variable                     | Default | Description                                                                     |
| ---------------------------- | ------- | ------------------------------------------------------------------------------- |
| `METRICS_ENDPOINT`           | (none)  | OTLP HTTP endpoint for metrics export. Metrics export is disabled when not set. |
| `METRICS_EXPORT_INTERVAL_MS` | `60000` | Export interval in milliseconds                                                 |
