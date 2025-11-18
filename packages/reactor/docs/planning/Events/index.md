# IEventBus

### Summary

The `IEventBus` is an async pub/sub mechanism. We can use an event bus to de-duplicate logic.

- It allows for both async and sync subscriptions to keep operations consistent.
- This is an in-memory implementation that does not persist events.
- Stack-safe -- meaning that subscribes and unsubscribes may be called safely from within event handlers but do not affect the current emit() call.
- Each emit() call guarantees every corresponding handler is called, serially.
- Does NOT require idempotent subscribers.
- Does NOT retry.

### Event Types

The event bus supports several categories of events:

#### Operation Events (10001-10099)

- **OPERATION_WRITTEN (10001)**: Emitted when operations are written to IOperationStore
- **OPERATIONS_READY (10002)**: Emitted after all read models have finished processing operations
- **JOB_FAILED (10003)**: Emitted when a job fails with an unrecoverable error

See [Operation Events Documentation](../ReadModels/coordinator.md) for detailed information about OPERATION_WRITTEN and OPERATIONS_READY.

See [Job Awaiter Documentation](../Jobs/job-awaiter.md) for information about JOB_FAILED and job lifecycle events.

### Persistence

The `IEventBus` is an in-memory implementation that does not persist events. Instead, the `IQueue` provides durability guarantees at the `Job` level.

This means that there are some edge cases in which, on crash or shutdown, the `IEventBus` may lose events and not guarantee delivery. The [Graceful Shutdown](../GracefulShutdown/index.md) document examines how systems can ensure eventual consistency.

### Dependencies

- None.

### Links

- [Interface](interface.md)

### Notes

- All in-memory with no persistence.
- While an initial implementation can be shared between client and server, the node implementation might be able to be optimized with `process.nextTick`.
