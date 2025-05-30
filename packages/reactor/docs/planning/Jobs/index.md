# IJobExecutor

### Summary

The `IJobExecutor` listens for 'jobAvailable' events from the event bus and pulls jobs from the queue when capacity allows. It provides configurable concurrency, retry logic with exponential backoff, and monitoring capabilities. The executor ensures jobs are processed in the correct order per document/scope/branch combination.

### Error Handling

> TODO: Define structured error events and typical metrics (queue lag, failure counts). Clarify how retries interact with the event log.

The executor emits a set of structured events so that clients can react to job progress and failures:

- **`jobStarted`** - issued when execution of a job begins.
- **`jobCompleted`** - issued after a job finishes successfully.
- **`jobRetry`** - issued when execution throws an error and the executor will retry the job.
- **`jobFailed`** - issued when execution throws an error and will not be retried.

#### Retry Logic

Retries will only be attempted if the job failed for a reason that is likely to be resolved by retrying. For example, if the job failed because the operation was already applied or because the operation was invalid, it will not be retried.

However, if the job failed because of a temporary network issue, it will be retried with exponential backoff + jitter.

#### Fatal Errors

If a `jobFailed` event is fired, we know that a set of operations could not be applied. We then follow a set of steps to try to resolve the issue:

1. Sync missing history – Attempt to finishin syncing from any remotes, for the documents affected, before continuing.

2. Re‑apply deterministically – Once caught up, retry applying the operation.

3. Bubble up a sync failure if still inconsistent – If the operation still cannot be applied even after resyncing, the reactor itself will emit a failure event (`fatalError`) for monitoring but will not persist the failure in the operations store. The failing reactor can mark the operation for manual reconciliation or trigger a rollback to some previous state.

### Dependencies

- [IQueue](../Queue/index.md)
- [IEventBus](../Events/index.md)
- [IOperationStore](../Reactor/Interfaces/IOperationStore.md)

### Links

- [Interface](interface.md)
- [Usage](usage.md)

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
