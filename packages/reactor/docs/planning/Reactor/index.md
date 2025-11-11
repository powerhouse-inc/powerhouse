# IReactor

### Summary

Manages DocumentModels and Documents with an asynchronous interface.
- Surfaces `ConsistencyToken`s from completed jobs and coordinates with read models
  to provide read-after-write guarantees when callers supply those tokens.

### Dependencies

- [IQueue](../Queue/index.md)
- [IEventBus](../Events/index.md)
- [IOperationStore](../Storage/IOperationStore.md)
- [IOperationIndex](../Cache/interface.md)
- [IWriteCache](../Cache/write-cache-interface.md)
- [IJobExecutor](../Jobs/index.md)

### Links

- [Interface](interface.md)
- [Usage](usage.md)
- [Diagram](diagram.md)
- [Batch Mutations](batches.md)
