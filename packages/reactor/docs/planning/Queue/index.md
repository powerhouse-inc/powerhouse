# IQueue

### Summary

The `IQueue` provides a simple API to queue new write jobs. Internally, it creates separate queues keyed by `(documentId, scope, branch)` to ensure proper ordering of operations within each document context. Jobs are processed in FIFO order within each queue to maintain consistency. When jobs are enqueued, the queue emits 'jobAvailable' events to the event bus to notify job executors.

When there is heavy contention (say many jobs enqueued from many clients on the same `(documentId, scope, branch)` combination), reshuffle logic is applied by the job executor to proactively prevent as many retries and requeues as possible.

### Dependencies

- [IEventBus](../Events/index.md)

### Links

* [Interface](interface.md)
* [Usage](usage.md)

### Notes

- The queue internally maintains separate queues keyed by `(documentId, scope, branch)` to ensure proper ordering of operations within each document context.
- Jobs within the same document/scope/branch combination are processed in FIFO order to maintain consistency.
- When a job is enqueued, the queue emits a 'jobAvailable' event to the event bus to notify job executors.
- Retry and requeue logic is handled by the job executor.
