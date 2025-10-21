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

The write cache is an in-memory LRU cache with persistent keyframe storage that stores ring buffers of `PHDocument` snapshots for fast retrieval by the job executor. It allows executors to start from recent document snapshots instead of replaying all operations from the beginning. The cache requires `IDocumentModelRegistry` to access reducers for rebuilding documents on cache misses, and uses `IKeyframeStore` to persist keyframe snapshots at regular intervals for fast cold-start recovery.

**Key characteristics:**

- In-memory ring buffer per document stream (ephemeral, fast)
- Persistent keyframe storage via IKeyframeStore (durable, indexed)
- Stores complete PHDocument objects
- Requires IDocumentModelRegistry for cache miss handling
- Requires IKeyframeStore for persistent keyframe storage
- Used by job executors
- Optimizes the write path for job execution
- Fast cold-start recovery using database-backed keyframes

### Dependencies

- [IOperationStore](../Storage/IOperationStore.md) - Source of operations for both caches
- [IDocumentModelRegistry](../Jobs/document-model-registry.md) - Provides reducers for IWriteCache to rebuild documents on cache miss
- [IKeyframeStore](../Storage/IKeyframeStore.md) - Provides persistent keyframe storage for IWriteCache to accelerate cold-start recovery

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

1. Job executor calls `IWriteCache.getState()` with documentId, documentType, scope, branch, and revision
2. Write cache handles retrieval internally:
   - On cache hit: returns cached PHDocument, updates LRU (fast)
   - On cache miss: checks `IKeyframeStore` for nearest keyframe snapshot, loads incremental operations from `IOperationStore`, gets reducer from `IDocumentModelRegistry`, replays operations, stores PHDocument in ring buffer, updates LRU, returns document
3. Executor receives complete PHDocument at requested revision
4. Executor executes reducers with new actions to produce updated PHDocument
5. Executor calls `IWriteCache.putState()` to store resulting PHDocument in cache (and persists keyframe to `IKeyframeStore` if at keyframe interval)
6. Executor writes operations to `IOperationStore` and `IOperationIndex`

**Read path optimization:**

1. Listeners query `IOperationIndex` for filtered operations
2. Sync manager queries `IOperationIndex` for synchronization
3. `IOperationIndex` provides pre-computed, optimized views
