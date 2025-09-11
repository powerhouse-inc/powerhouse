# IEventBus

### Summary

The `IEventBus` is an async pub/sub mechanism. We can use an event bus to de-duplicate logic.

- It allows for both async and sync subscriptions to keep operations consistent.
- This is an in-memory implementation that does not persist events.
- Stack-safe -- meaning that subscribes and unsubscribes may be called safely from within event handlers but do not affect the current emit() call.
- Each emit() call guarantees every corresponding handler is called, serially.
- Does NOT require idempotent subscribers.
- Does NOT retry.

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
