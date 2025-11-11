# Batch Mutations

### Summary
- Introduces `mutateBatch` so callers can submit several document mutations in one request.
- Returns individual `JobInfo`s keyed by caller-supplied plan keys while preserving per-document serialization.
- Leverages existing queue dependency hints (`queueHint`) to enforce cross-document ordering.

### Motivation
- `reactor.mutate` currently enqueues a single job scoped to one document id, forcing orchestration flows (e.g. create → add file → add relationship) to chain multiple API calls.
- Clients must poll and coordinate job completion manually when actions span multiple documents.
- The queue already supports dependency graphs through `queueHint` (`packages/reactor/src/queue/queue.ts`), but there is no public API to populate them safely.

### API
Extend `IReactor` with:

```ts
mutateBatch(request: BatchMutationRequest, signal?: AbortSignal): Promise<BatchMutationResult>;
```

```ts
type BatchMutationRequest = {
  jobs: MutationJobPlan[];
};

type MutationJobPlan = {
  key: string;         // Unique identifier supplied by the caller
  documentId: string;
  scope: string;
  branch: string;
  actions: Action[];   // All actions must target the specified scope
  dependsOn: string[]; // Plan keys that must complete first (can be empty)
};

type BatchMutationResult = {
  jobs: Record<string, JobInfo>; // Plan key -> JobInfo
};
```

Example:

```ts
await reactor.mutateBatch({
  jobs: [
    {
      key: "createChild",
      documentId: childId,
      scope: "document",
      branch: "main",
      actions: [createAction, upgradeAction],
      dependsOn: [],
    },
    {
      key: "addFile",
      documentId: parentId,
      scope: "global",
      branch: "main",
      actions: [addFileAction],
      dependsOn: ["createChild"],
    },
    {
      key: "linkChild",
      documentId: parentId,
      scope: "document",
      branch: "main",
      actions: [addRelationshipAction],
      dependsOn: ["addFile"],
    },
  ],
});
```

### Execution Semantics

#### Validation
- Reject duplicate plan keys.
- Ensure every reference in `dependsOn` is present in the request and that the graph is acyclic (topological sort).
- Confirm each plan supplies non-empty `actions` and that every action’s scope matches the declared plan scope.
- Require explicit `scope`, `branch`, and `dependsOn` (even if empty).

#### Job Creation
- Pre-generate job ids for each plan to map plan keys → job ids.
- Translate `dependsOn` keys into `queueHint` arrays containing the corresponding job ids.
- Build `Job` objects with the existing structure (`documentId`, `scope`, `branch`, `actions`, `queueHint`, etc.).
- Register `JobInfo`s with the job tracker before enqueuing each job.

#### Dependency Enforcement
- The queue defers dequeue until every job id listed in `queueHint` is marked complete (`completeJob` in `packages/reactor/src/queue/queue.ts`).
- Jobs on the same document still serialize because queue keys remain `documentId:scope:branch`.

#### Error Handling
- Abort the entire request before enqueuing if validation fails.
- If any enqueue step throws, clean up already-registered jobs (remove from queue, deregister from tracker) and surface an aggregated error that includes the failing plan key.
- Preserve existing retry semantics; retries reuse the original job id so dependency edges remain intact.

### Testing
- Unit coverage for validation failures: duplicate keys, missing dependencies, dependency cycles, mismatched action scopes, empty action lists.
- Queue tests asserting dequeue order respects both per-document serialization and cross-plan dependencies.
- Integration test updating the document-drive orchestration scenario to exercise `mutateBatch` end-to-end.

### Follow-Up
- Add `mutateBatch` to all `IReactor` implementations (local server, MCP bridge, etc.).
- Update orchestration call sites to rely on the new API.
- Consider higher-level helpers for common drive workflows once usage patterns emerge.
