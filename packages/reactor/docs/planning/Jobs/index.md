# IJobExecutor

### Summary

The `IJobExecutor` listens for 'jobAvailable' events from the event bus and pulls jobs from the queue when capacity allows. It provides configurable concurrency, retry logic with exponential backoff, and monitoring capabilities. The executor ensures jobs are processed in the correct order per document/scope/branch combination.

### Dependencies

- [IQueue](../Queue/index.md)
- [IEventBus](../Events/index.md)
- [IOperationStore](../Reactor/Interfaces/IOperationStore.md)

### Links

* [Interface](interface.md)
* [Usage](usage.md)

### Notes

- The job executor listens for 'jobAvailable' events from the event bus instead of polling the queue.
- When a 'jobAvailable' event is received, the executor checks if it has capacity to process more jobs.
- If capacity allows, the executor pulls a job from the queue and executes it.
- When a job is fully executed, it tries to pull another job from the queue.
- Jobs should be executed in the correct order per document/scope/branch to maintain consistency.
- The executor should handle retries for failed jobs with exponential backoff.
- Concurrency should be configurable but respect document/scope/branch ordering constraints.
- The executor should emit events for monitoring and debugging purposes.
- Failed jobs should be retried according to their retry configuration.