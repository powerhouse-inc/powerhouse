# IJobExecutor

### Summary

The `IJobExecutor` listens for 'jobAvailable' events from the event bus and pulls jobs from the queue when capacity allows. It provides configurable concurrency, retry logic with exponential backoff, and monitoring capabilities. The executor ensures jobs are processed in the correct order per document/scope/branch combination.

### Reshuffle Logic

The `IJobExecutor` will proactively reshuffle jobs to prevent as many revision mismatches as possible.

This can be done by invoking the merge helper with `reshuffleByTimestamp`. This rearranges the operations and introduces a skip offset for the newly inserted operations:

```
const trunk = garbageCollect(sortOperations(storageDocumentOperations));
const [invertedTrunk, tail] = attachBranch(trunk, branch);
const newHistory =
  tail.length < 1
    ? invertedTrunk
    : merge(trunk, invertedTrunk, reshuffleByTimestamp);
```

`merge` sets up a `startIndex` with a `skip` value and passes it to `reshuffle` (e.g., `reshuffleByTimestamp`). This function assigns new indices and updates the skip field for the reordered operations:

```
const newOperationHistory = reshuffle(
  {
    index: nextIndex,
    skip: nextIndex - (maxCommonIndex + 1),
  },
  _targetOperations,
  filteredMergeOperations,
);
```

`reshuffleByTimestamp` then walks through the combined operations, reassigning indices and handling the skip value:

```
return [...opsA, ...opsB]
  .sort((a, b) =>
    new Date(a.timestamp || "").getTime() -
    new Date(b.timestamp || "").getTime()
  )
  .map((op, i) => ({
    ...op,
    index: startIndex.index + i,
    skip: i === 0 ? startIndex.skip : 0,
  }));
```

### Error Handling

The executor emits a set of structured events so that clients can react to job progress and failures:

- **`jobStarted`** - issued when execution of a job begins.
- **`jobCompleted`** - issued after a job finishes successfully.
- **`jobRetry`** - issued when execution throws an error and the executor will retry the job.
- **`jobFailed`** - issued when execution throws an error and will not be retried.

#### Retry Logic

Retries will only be attempted if the job failed for a reason that is likely to be resolved by retrying. For example, if the job failed because the operation was already applied or because the operation was invalid, it will not be retried.

In some cases, a retry might result in a requeue instead, where the job is added back to the queue to wait for some other job to be processed.

If a job failed because of a temporary network issue, for example, it will be retried with exponential backoff + jitter.

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
