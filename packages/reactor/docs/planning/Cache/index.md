# Cache

### Summary

Cache implementations for Reactor performance optimization. This directory contains specifications for two distinct caching systems that serve different purposes in the Reactor architecture.

### Caching Systems

#### IOperationIndex

The operation index provides an optimized, flattened view of operations organized by collections for efficient querying by listeners and sync channels. This is a persistent, database-backed index that reduces operations across many related documents into optimized streams.

**Key characteristics:**

- Persistent storage (PostgreSQL/PGLite)
- Collection-based organization
- Used by listeners and sync managers
- Optimizes the read path for operation streams

#### IWriteCache

The write cache is an in-memory LRU cache that stores ring buffers of document snapshots for fast state retrieval by the job executor. It allows executors to start from recent snapshots instead of replaying all operations from the beginning.

**Key characteristics:**

- In-memory storage only
- Ring buffer per document stream
- Used by job executors
- Optimizes the write path for job execution

### Dependencies

- [IOperationStore](../Storage/IOperationStore.md) - Source of operations for both caches

### Links

#### IOperationIndex
* [Interface](interface.md) - TypeScript interface for the operation index
* [Schema](schema.md) - Database schema for the operation index
* [Overview](operation-index.md) - Detailed architectural overview

#### IWriteCache
* [Interface](write-cache-interface.md) - TypeScript interface for the write cache
* [Overview](write-cache.md) - Detailed architectural overview

### Integration in Reactor Flow

```mermaid
flowchart LR
  subgraph Write Path
    Actions --> Queue --> JobExecutor
    JobExecutor --> WriteCache["IWriteCache<br/>(check before reducer)"]
    JobExecutor --> OpStore["IOperationStore"]
    JobExecutor --> OpIndex["IOperationIndex"]
    WriteCache -.->|cache miss| OpStore
  end

  subgraph Read Path
    OpIndex --> Listeners
    OpIndex --> SyncManager
    OpStore -.->|rebuild on miss| OpIndex
  end
```

**Write path optimization:**

1. Job executor calls `IWriteCache.getState()` to get document state at required revision
2. Write cache handles retrieval internally:
   - On cache hit: returns cached state, updates LRU (fast)
   - On cache miss: loads from `IOperationStore`, replays operations, stores in ring buffer, updates LRU, returns state
3. Executor receives exact state it requested
4. Executor executes reducers with new actions
5. Executor calls `IWriteCache.putState()` to store resulting state in cache
6. Executor writes operations to `IOperationStore` and `IOperationIndex`

**Read path optimization:**

1. Listeners query `IOperationIndex` for filtered operations
2. Sync manager queries `IOperationIndex` for synchronization
3. `IOperationIndex` provides pre-computed, optimized views
