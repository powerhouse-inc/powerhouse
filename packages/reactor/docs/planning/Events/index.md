# IEventBus

### Summary

The `IEventBus` is an async pub/sub mechanism. We can use an event bus to de-duplicate logic. It allows for both async and sync subscriptions to keep operations consistent. This is an in-memory implementation that does not persist events. Each emit() call guarantees each corresponding handler is called, serially.

### Dependencies

- None.

### Links

* [Interface](interface.md)

### Notes

- All in-memory with no persistence.
- While an initial implementation can be shared between client and server, the node implementation might be able to be optimized with `process.nextTick`.
