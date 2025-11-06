# Load Operations

### Summary
- Introduces `load` to accept pre-existing operations from other reactors.
- Operations are enqueued for verification and automatically reshuffled by timestamp alongside existing operations.
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
- All operations (existing and incoming) are reshuffled by timestamp using the existing `reshuffleByTimestamp` or `reshuffleByTimestampAndIndex` utilities.
- Operations that conflict are reordered, and `skip` values are calculated for the first reshuffled operation.
- New indices and hashes are assigned to reshuffled operations.
- See [Reshuffle documentation](../Jobs/reshuffle.md) for detailed reshuffling semantics.

#### Storage
- Verified and reshuffled operations are persisted to `IOperationStore`.
- Write-cache revisions are updated.
- Operation events are emitted for read models to consume.

### Relationship to Mutate

| Aspect | `mutate` | `load` |
|--------|----------|--------|
| Input | `Action[]` | `Operation[]` |
| Purpose | Apply new changes | Import existing operations |
| Operation generation | Reducer generates operations | Operations already exist |
| Reshuffling | Only if conflicts detected | Always reshuffles by timestamp |
| Use case | Local modifications | Cross-reactor synchronization |

### Testing
- Unit tests for validation failures: invalid operations, missing metadata, hash mismatches.
- Integration tests verifying operations are correctly reshuffled when indices conflict.
- End-to-end tests simulating cross-reactor operation import scenarios.
- Tests ensuring load jobs integrate correctly with the job queue and executor.

### Follow-Up
- Add `load` to all `IReactor` implementations.
- Consider optimization for bulk operation loading.
- Evaluate whether consistency tokens should be supported for read-after-write semantics on load operations.
