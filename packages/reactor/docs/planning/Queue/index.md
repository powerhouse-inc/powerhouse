# IQueue

### Summary

The `IQueue` provides a simple API to queue new write jobs. Internally, it creates separate queues keyed by documentId, scope, and branch to ensure proper ordering of operations within each document context. Jobs are processed in FIFO order within each queue to maintain consistency. When jobs are enqueued, the queue emits 'jobAvailable' events to the event bus to notify job executors.

### Dependencies

- [IEventBus](../Events/index.md)

### Links

* [Interface](interface.md)
* [Usage](usage.md)

### Notes

- The queue internally maintains separate queues keyed by `(documentId, scope, branch)` to ensure proper ordering of operations within each document context.
- Jobs within the same document/scope/branch combination are processed in FIFO order to maintain consistency.
- When a job is enqueued, the queue emits a 'jobAvailable' event to the event bus to notify job executors.
- Retry logic should be handled by the job executor, with exponential backoff recommended.
