# Load Operations

### Summary
- Introduces `load` to accept pre-existing operations from other reactors.
- Incoming operations may trigger the reshuffle flow; conflicts generate a batch of new operations whose first entry includes a `skip` value that rewinds the log before applying the regenerated sequence, while conflict-free operations are appended as-is.
- Returns `JobInfo` for tracking the load job through the job queue.

### Motivation
- `reactor.mutate` applies actions that generate new operations, but there is no way to accept operations that were already executed by another reactor.
- Cross-reactor synchronization requires importing operations that have already been applied elsewhere.
- Operations from different reactors may have conflicting indices or timestamps that require reshuffling to maintain consistency.

### API
Extend `IReactor` with:

```ts
load(
  docId: string,
  branch: string,
  operations: Operation[],
  signal?: AbortSignal,
): Promise<JobInfo>;
```

Example:

```ts
const jobInfo = await reactor.load(
  "doc-123",
  "main",
  remoteOperations,
);
```

### Execution Semantics

#### Validation
- Verify that all operations target the specified document.
- Confirm operations contain required metadata (index, timestamp, hash, action).
- Validate operation hashes match their content.

#### Job Creation
- Create a load job with the document id, branch, and operations.
- Register the job with the job tracker before enqueuing.
- Enqueue the job on the standard job queue.

#### Reshuffling
- The job executor merges incoming operations with existing operations in the document.
- If conflicts are detected, the combined set is reshuffled by timestamp using the existing `reshuffleByTimestamp` or `reshuffleByTimestampAndIndex` utilities.
- During a reshuffle, the first generated operation in the batch includes a `skip` value to rewind the log back to the common ancestor before applying the remainder of the regenerated operations.
- Conflict-free imports skip the reshuffle path and are simply appended. Existing operations in the log remain immutable and are never rewritten.
- See [Reshuffle documentation](../Jobs/reshuffle.md) for detailed semantics.

#### Storage
- Verified operations (reshuffled when necessary) are persisted to `IOperationStore`.
- Write-cache revisions are updated.
- Operation events are emitted for read models to consume. When an event carries a `skip > 0`, read models should call `IOperationStore.getSinceId` with that operation id (or earlier) to replay the slice needed to rebuild state; otherwise they continue processing incrementally.

### Relationship to Mutate

| Aspect | `mutate` | `load` |
|--------|----------|--------|
| Input | `Action[]` | `Operation[]` |
| Purpose | Apply new changes | Import existing operations |
| Operation generation | Reducer generates operations | Operations already exist |
| Reshuffling | Only if conflicts detected | Only if conflicts detected (skip carried on first op of batch) |
| Use case | Local modifications | Cross-reactor synchronization |
| Consistency token | Returned with `JobInfo` | Returned with `JobInfo` |

### Testing
- Unit tests for validation failures: invalid operations, missing metadata, hash mismatches.
- Integration tests verifying operations are correctly reshuffled when indices conflict.
- End-to-end tests simulating cross-reactor operation import scenarios.
- Tests ensuring load jobs integrate correctly with the job queue and executor.

### Follow-Up
- Add `load` to all `IReactor` implementations.
- Consider optimization for bulk operation loading.
