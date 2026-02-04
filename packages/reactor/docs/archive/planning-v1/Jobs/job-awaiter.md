# Job Awaiter

## Overview

The `JobAwaiter` provides an event-driven mechanism for waiting on job completion. It subscribes to operation and job events emitted by the reactor's event bus and resolves promises when jobs reach terminal states.

## Architecture

### Event-Driven Design

The JobAwaiter uses the reactor's event bus to track job lifecycle without polling:

```
Job Execution Flow:
  SimpleJobExecutor.executeJob()
    |
    ├─> Writes to IOperationStore
    │   └─> Emits OPERATION_WRITTEN
    │       └─> JobTracker updates job status to WRITE_COMPLETED
    │           └─> JobAwaiter resolves waiters (if terminal)
    |
    ├─> ReadModelCoordinator processes operations
    │   └─> Emits OPERATIONS_READY
    │       └─> JobTracker updates job status to READ_MODELS_READY
    │           └─> JobAwaiter resolves waiters (if terminal)
    |
    └─> On Failure
        └─> Emits JOB_FAILED
            └─> JobTracker updates job status to FAILED
                └─> JobAwaiter rejects waiters
```

## Job Status States

The JobAwaiter tracks jobs through multiple states that align with operation events:

### State Transitions

**Successful Execution**:
```
PENDING → RUNNING → WRITE_COMPLETED → READ_MODELS_READY
```

**Failed Execution**:
```
PENDING → RUNNING → FAILED
```

### Event Alignment

| Job Status | Triggering Event | Emitted By | Description |
|------------|-----------------|------------|-------------|
| `PENDING` | Job queued | `IQueue` | Initial state when job created |
| `RUNNING` | Job started | `IJobExecutor` | Execution begins |
| `WRITE_COMPLETED` | `OPERATION_WRITTEN` (10001) | `IJobExecutor` | Operations persisted to store |
| `READ_MODELS_READY` | `OPERATIONS_READY` (10002) | `IReadModelCoordinator` | Read models indexed, queries will see data |
| `FAILED` | `JOB_FAILED` (10003) | `IJobExecutor` | Unrecoverable error occurred |
