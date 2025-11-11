# Consistency Tracker

### Summary

Multiple read models will need to know when the write side has advanced past a
given operation index. Rather than having every implementation reinvent the same
bookkeeping, we provide a shared tracker object. It records the highest
`(documentId, scope, branch)` index seen so far and offers utilities for
waiting until a coordinate or set of coordinates is satisfied.

The tracker is designed to be used by read models (`IDocumentView`,
`IDocumentIndexer`, etc.) and by coordination layers that must block on
consistency tokens.

### Responsibilities

- Maintain an in-memory map keyed by `(documentId, scope, branch)` with the
  latest processed operation index.
- Offer atomic update helpers that read models call immediately after they have
  durably indexed a batch of operations.
- Provide promise-based waiters that resolve when specific coordinates have been
  met, supporting optional timeouts and abort signals.
- Expose lightweight serialization hooks so the current map can be snapshotted
  or restored during startup if a read model wants persistence.

### Interface Sketch

```ts
type ConsistencyKey = `${string}:${string}:${string}`;

interface IConsistencyTracker {
  update(coordinates: ConsistencyCoordinate[]): void;
  getLatest(key: ConsistencyKey): number | undefined;
  waitFor(
    coordinates: ConsistencyCoordinate[],
    timeoutMs?: number,
    signal?: AbortSignal,
  ): Promise<void>;
  serialize(): Array<[ConsistencyKey, number]>;
  hydrate(entries: Array<[ConsistencyKey, number]>): void;
}
```

### Usage Notes

- Read models call `update` only after their storage writes are committed. This
  ensures the tracker never reports an index that is not actually queryable.
- `waitFor` is used by higher-level coordinators. It deduplicates coordinates
  before waiting, so callers can pass the raw `ConsistencyToken`.
- The tracker can be instantiated once per process and shared across read model
  implementations. Each read model decides whether to persist the map on disk or
  rely solely on replay from the write side.

### Testing

- The tracker is tested in isolation, allowing us to validate wait semantics,
  timeouts, abort behavior, and serialization without a full read model.
- End-to-end read model tests mock out the tracker to ensure integrations call
  `update` and `waitFor` as expected.
