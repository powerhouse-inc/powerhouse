# IWriteCache Implementation Plan - Write-Side Projection

This document provides a step-by-step implementation plan for the IWriteCache as a write-side projection. The plan is broken down into manageable tasks suitable for iterative LLM implementation.

## Overview

The IWriteCache is a **write-side projection** that optimizes document state retrieval for the job executor. It uses a three-layer storage strategy:

1. **In-Memory Layer**: Ring buffer storing all recent document revisions (ephemeral, fast)
2. **K/V Store Layer**: Keyframe snapshots persisted every N revisions (durable, pluggable)
3. **Rebuild Layer**: Falls back to rebuilding from IOperationStore using reducers (cold start)

This is separate from IDocumentView (read-side projection) which optimizes queries and searches.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    IWriteCache                          │
│                 (Write-Side Projection)                 │
├─────────────────────────────────────────────────────────┤
│  In-Memory: Ring buffer (all recent revisions)          │
│  K/V Store: Keyframes (every Nth revision)              │
│  Fallback:  Rebuild from operations + reducer           │
└─────────────────────────────────────────────────────────┘
         │                │                 │
         │                │                 │
         v                v                 v
   Ring Buffer      IKeyValueStore    IOperationStore
   (ephemeral)      (Redis/IndexedDB)  + Registry
```

## Dependencies

- `packages/reactor/src/storage/interfaces.ts` - IOperationStore, PagedResults, PagingOptions
- `packages/reactor/src/registry/interfaces.ts` - IDocumentModelRegistry
- `packages/reactor/src/cache/kv-store.ts` - IKeyValueStore (new)
- `document-model` - PHDocument, Operation, DocumentModelModule

## Phase 0: Key-Value Store Abstraction

### Task 0.1: Create IKeyValueStore interface
- [x] Create `packages/reactor/src/cache/kv-store.ts`
- [x] Define `IKeyValueStore` interface with methods:
  - `get(key: string, signal?: AbortSignal): Promise<string | undefined>`
  - `put(key: string, value: string, signal?: AbortSignal): Promise<void>`
  - `delete(key: string, signal?: AbortSignal): Promise<void>`
  - `clear(): Promise<void>`
  - `startup(): Promise<void>`
  - `shutdown(): Promise<void>`
- [x] Add comprehensive JSDoc

**Acceptance Criteria:**
- Interface provides simple K/V abstraction
- All methods properly typed
- JSDoc explains pluggable implementations

### Task 0.2: Create InMemoryKeyValueStore
- [x] Create `InMemoryKeyValueStore` class in same file
- [x] Implement using `Map<string, string>`
- [x] Implement all IKeyValueStore methods
- [x] Use for testing and development

**Acceptance Criteria:**
- Simple Map-based implementation
- All methods work synchronously (wrapped in Promise)
- No external dependencies

### Task 0.3: Create tests for InMemoryKeyValueStore
- [x] Create `packages/reactor/test/cache/kv-store.test.ts`
- [x] Test: should store and retrieve values
- [x] Test: should return undefined for missing keys
- [x] Test: should delete keys
- [x] Test: should clear all keys
- [x] Test: should handle startup/shutdown

**Acceptance Criteria:**
- All tests pass with `pnpm test`
- 100% coverage on InMemoryKeyValueStore
- Tests serve as examples for other implementations

## Phase 1: Core Types and Interfaces

### Task 1.1: Create cache types file
- [x] Create `packages/reactor/src/cache/types.ts`
- [x] Define `WriteCacheConfig` type with options:
  - `maxDocuments` (default: 1000)
  - `ringBufferSize` (default: 10)
  - `keyframeInterval` (default: 10) - persist every Nth revision
- [x] Define `DocumentStreamKey` type (documentId, scope, branch)
- [x] Define `CachedSnapshot` type (revision, document)
- [x] Define `KeyframeSnapshot` type for K/V store serialization
- [x] Export all types

**Acceptance Criteria:**
- File compiles without errors
- All types properly exported in index
- Default values: maxDocuments=1000, ringBufferSize=10, keyframeInterval=10

### Task 1.2: Create IWriteCache interface
- [x] Create `packages/reactor/src/cache/interfaces.ts`
- [x] Define `IWriteCache` interface with all methods from spec:
  - `getState(documentId, documentType, scope, branch, targetRevision, signal): Promise<PHDocument>`
  - `putState(documentId, documentType, scope, branch, revision, document): void`
  - `invalidate(documentId, scope?, branch?): number`
  - `clear(): void`
  - `startup(): Promise<void>`
  - `shutdown(): Promise<void>`
- [x] Add comprehensive JSDoc comments for each method

**Acceptance Criteria:**
- Interface matches specification exactly
- All parameters properly typed (no any or unknown)
- JSDoc includes examples from spec

### Task 1.3: Update package exports
- [x] Add cache exports to `packages/reactor/src/index.ts`
- [x] Export IWriteCache interface
- [x] Export WriteCacheConfig type
- [x] Ensure proper module resolution

**Acceptance Criteria:**
- `pnpm tsc --build` passes in reactor package
- Exports accessible from other packages

## Phase 2: Ring Buffer Implementation

### Task 2.1: Create RingBuffer class
- [ ] Create `packages/reactor/src/cache/buffer/ring-buffer.ts`
- [ ] Implement generic `RingBuffer<T>` class with:
  - Private `buffer: T[]`
  - Private `head: number = 0`
  - Private `size: number = 0`
  - Private `capacity: number`
- [ ] Implement `constructor(capacity: number)`
- [ ] Implement `push(item: T): void` method (circular overwrite)
- [ ] Implement `getAll(): T[]` method (returns items in chronological order)
- [ ] Implement `clear(): void` method
- [ ] Implement `get length(): number` getter

**Acceptance Criteria:**
- Class properly handles circular buffer logic
- getAll() returns items in insertion order (oldest to newest)
- All methods use classical OOP patterns (no Pick/Omit)

### Task 2.2: Create RingBuffer unit tests
- [ ] Create `packages/reactor/test/cache/ring-buffer.test.ts`
- [ ] Test: should initialize with correct capacity
- [ ] Test: should add items sequentially
- [ ] Test: should overwrite oldest item when full
- [ ] Test: should return items in chronological order
- [ ] Test: should handle edge case of capacity=1
- [ ] Test: should clear all items
- [ ] Test: should track size correctly

**Acceptance Criteria:**
- All tests pass with `pnpm test`
- 100% code coverage on RingBuffer class
- Tests use vitest framework

### Task 2.3: Create DocumentRingBuffer wrapper
- [ ] Create wrapper type in `packages/reactor/src/cache/buffer/ring-buffer.ts`
- [ ] Define `DocumentRingBuffer` that wraps `RingBuffer<CachedSnapshot>`
- [ ] Add helper method `findNearest(targetRevision?: number): CachedSnapshot | undefined`
  - Returns exact match if targetRevision provided and exists
  - Returns newest snapshot <= targetRevision if targetRevision provided
  - Returns newest snapshot if targetRevision not provided
- [ ] Add helper method `has(revision: number): boolean`

**Acceptance Criteria:**
- findNearest correctly implements search logic
- Handles undefined targetRevision (returns newest)
- Tests added to ring-buffer.test.ts

## Phase 3: LRU Cache Implementation

### Task 3.1: Create LRU tracker
- [ ] Create `packages/reactor/src/cache/lru/lru-tracker.ts`
- [ ] Implement `LRUTracker<K>` class using Map for O(1) operations
- [ ] Track access order with doubly-linked list structure
- [ ] Implement `touch(key: K): void` - mark as most recently used
- [ ] Implement `evict(): K | undefined` - return least recently used key
- [ ] Implement `remove(key: K): void` - remove specific key from tracking
- [ ] Implement `clear(): void` - reset tracker
- [ ] Implement `get size(): number` getter

**Acceptance Criteria:**
- O(1) time complexity for touch operation
- O(1) time complexity for evict operation
- Classical OOP implementation

### Task 3.2: Create LRU tracker unit tests
- [ ] Create `packages/reactor/test/cache/lru/lru-tracker.test.ts`
- [ ] Test: should track most recently used items
- [ ] Test: should evict least recently used item
- [ ] Test: should handle touch updating order
- [ ] Test: should handle removal of tracked items
- [ ] Test: should clear all tracked items
- [ ] Test: should maintain correct size
- [ ] Test: should handle edge cases (empty, single item)

**Acceptance Criteria:**
- All tests pass
- Tests verify LRU ordering behavior
- 100% code coverage

## Phase 4: Core Cache Structure

### Task 4.1: Create cache storage structure
- [ ] Create `packages/reactor/src/cache/kysely-write-cache.ts`
- [ ] Define `DocumentStream` type (key + ringBuffer)
- [ ] Create `KyselyWriteCache` class implementing `IWriteCache`
- [ ] Add private fields:
  - `streams: Map<string, DocumentStream>` (in-memory ring buffers)
  - `lruTracker: LRUTracker<string>` (LRU tracking)
  - `kvStore: IKeyValueStore` (keyframe storage)
  - `operationStore: IOperationStore` (fallback rebuild)
  - `registry: IDocumentModelRegistry` (reducer access)
  - `config: Required<WriteCacheConfig>` (configuration)
- [ ] Implement constructor accepting dependencies
- [ ] Implement `startup(): Promise<void>`:
  - Call `kvStore.startup()`
  - Do NOT pre-warm cache (lazy load on demand)
- [ ] Implement `shutdown(): Promise<void>`:
  - Call `kvStore.shutdown()`

**Acceptance Criteria:**
- Class structure follows patterns from KyselyOperationStore
- Required config type ensures no undefined values
- All private fields properly typed
- Public methods listed before private methods
- Startup/shutdown delegate to K/V store

### Task 4.2: Implement cache key utilities
- [ ] Add private method `makeStreamKey(documentId, scope, branch): string`
- [ ] Implement consistent string serialization (e.g., `${documentId}:${scope}:${branch}`)
- [ ] Add private method `getOrCreateStream(key: string): DocumentStream`
- [ ] Implement LRU eviction when maxDocuments reached

**Acceptance Criteria:**
- Key generation is deterministic and unique
- Eviction triggers at correct capacity
- Tests verify key generation consistency

### Task 4.3: Implement keyframe utilities
- [ ] Add private method `makeKeyframeKey(documentId, documentType, scope, branch, revision): string`
- [ ] Format: `keyframe:${documentId}:${documentType}:${scope}:${branch}:${revision}`
- [ ] Add private method `isKeyframeRevision(revision: number): boolean`
- [ ] Returns `revision > 0 && revision % config.keyframeInterval === 0`
- [ ] Add private method `serializeKeyframe(document: PHDocument): string`
- [ ] Use JSON.stringify for now (optimize later if needed)
- [ ] Add private method `deserializeKeyframe(data: string): PHDocument`
- [ ] Use JSON.parse with error handling

**Acceptance Criteria:**
- Keyframe keys are unique and parseable
- Serialization handles large documents
- Deserialization is robust to malformed data

### Task 4.4: Implement putState with keyframe logic
- [ ] Implement `putState(documentId, documentType, scope, branch, revision, document): void`
- [ ] Deep copy document using `structuredClone()`
- [ ] Create stream key from parameters
- [ ] Get or create document stream
- [ ] Add snapshot to ring buffer (always)
- [ ] Update LRU tracker
- [ ] Handle eviction when at capacity
- [ ] **NEW**: Check if keyframe revision using `isKeyframeRevision(revision)`
- [ ] **NEW**: If keyframe, persist to K/V store asynchronously
  - Don't await (fire and forget)
  - Log errors but don't fail putState

**Implementation:**
```typescript
putState(...): void {
  // ... existing logic ...

  // Keyframe persistence
  if (this.isKeyframeRevision(revision)) {
    const key = this.makeKeyframeKey(documentId, documentType, scope, branch, revision);
    const data = this.serializeKeyframe(safeCopy);
    this.kvStore.put(key, data).catch(err => {
      console.error(`Failed to persist keyframe ${key}:`, err);
    });
  }
}
```

**Acceptance Criteria:**
- Documents are deep copied (mutations don't affect cache)
- LRU tracking updated on every put
- Eviction logic correctly removes entire ring buffers
- Keyframes persisted to K/V store on interval
- Keyframe persistence doesn't block putState

### Task 4.5: Create basic cache tests
- [ ] Create `packages/reactor/test/cache/kysely-write-cache.test.ts`
- [ ] Test: should store and track documents
- [ ] Test: should deep copy documents on put
- [ ] Test: should evict LRU stream when at capacity
- [ ] Test: should maintain ring buffer per stream
- [ ] Test: should handle multiple scopes/branches separately

**Acceptance Criteria:**
- Tests use real PGLite database via createTestOperationStore()
- Tests verify deep copy behavior
- Tests verify LRU eviction

## Phase 5: Cache Hit Path (getState)

### Task 5.1: Implement cache hit path
- [ ] Implement basic `getState` with cache hit logic:
  - Check abort signal
  - Make stream key
  - Look up stream in cache
  - If found, search ring buffer for matching revision
  - If exact match or newest, deep copy and return
  - Update LRU tracker on hit
  - Return cached document (deep copied)
- [ ] Handle targetRevision undefined (return newest)
- [ ] Handle exact revision match
- [ ] Throw placeholder error for cache miss (Phase 6)

**Acceptance Criteria:**
- Cache hits return correct document
- Documents are deep copied on return
- LRU updated on cache hit
- Handles abort signal

### Task 5.2: Create cache hit tests
- [ ] Test: should return exact revision match on cache hit
- [ ] Test: should return newest snapshot when targetRevision undefined
- [ ] Test: should return deep copy (mutations don't affect cache)
- [ ] Test: should update LRU on cache hit
- [ ] Test: should respect abort signal
- [ ] Test: should handle cache miss (expect placeholder error)

**Acceptance Criteria:**
- All cache hit scenarios covered
- Deep copy behavior verified
- LRU behavior verified

## Phase 6: Cold Miss Rebuild (with Keyframe Optimization)

### Task 6.1: Implement findNearestKeyframe helper
- [ ] Add private method `findNearestKeyframe(documentId, documentType, scope, branch, targetRevision, signal): Promise<{revision: number, document: PHDocument} | undefined>`
- [ ] Calculate possible keyframe revisions: target, target-10, target-20, ...
- [ ] Try loading from K/V store in reverse order (newest first)
- [ ] Return first found keyframe
- [ ] Return undefined if no keyframes found

**Implementation:**
```typescript
private async findNearestKeyframe(...): Promise<...> {
  const interval = this.config.keyframeInterval;

  // Calculate keyframe revisions to check:
  // If targetRevision=47, interval=10, check: 40, 30, 20, 10
  const keyframeRevisions: number[] = [];
  for (let rev = Math.floor(targetRevision / interval) * interval;
       rev > 0;
       rev -= interval) {
    keyframeRevisions.push(rev);
  }

  // Try each keyframe (newest first)
  for (const rev of keyframeRevisions) {
    const key = this.makeKeyframeKey(documentId, documentType, scope, branch, rev);
    const data = await this.kvStore.get(key, signal);
    if (data) {
      try {
        const document = this.deserializeKeyframe(data);
        return { revision: rev, document };
      } catch (err) {
        console.warn(`Failed to deserialize keyframe ${key}:`, err);
      }
    }
  }

  return undefined;
}
```

**Acceptance Criteria:**
- Finds nearest keyframe <= targetRevision
- Returns newest available keyframe
- Handles deserialization errors gracefully
- Returns undefined if no keyframes exist

### Task 6.2: Implement createInitialDocument helper
- [ ] Add private method `createInitialDocument(documentId, documentType, operation): PHDocument`
- [ ] Get module from registry
- [ ] Use module's document model utilities to create initial document
- [ ] Apply first operation if needed
- [ ] Return initialized document

**Acceptance Criteria:**
- Method creates valid PHDocument
- Integrates with IDocumentModelRegistry correctly
- Handles different document types

### Task 6.3: Implement cold miss rebuild with keyframe optimization
- [ ] Add private method `coldMissRebuild(documentId, documentType, scope, branch, targetRevision, signal): Promise<PHDocument>`
- [ ] **NEW**: First, try to find nearest keyframe using `findNearestKeyframe()`
- [ ] If keyframe found, use it as starting point (keyframe-accelerated rebuild)
- [ ] If no keyframe, rebuild from scratch
- [ ] Get reducer from registry using `registry.getModule(documentType).reducer`
- [ ] Stream operations using `operationStore.getSince(documentId, scope, branch, startRevision, paging, signal)`
  - startRevision = keyframe.revision if keyframe found, else 0
- [ ] Use cursor-based paging with pageSize=100
- [ ] Apply operations incrementally through reducer
- [ ] Stop when targetRevision reached (if specified)
- [ ] Handle abort signal between pages
- [ ] Return built document

**Implementation:**
```typescript
private async coldMissRebuild(...): Promise<PHDocument> {
  // Try to find keyframe first (optimization)
  const keyframe = await this.findNearestKeyframe(
    documentId,
    documentType,
    scope,
    branch,
    targetRevision || Number.MAX_SAFE_INTEGER,
    signal
  );

  let document: PHDocument;
  let startRevision: number;

  if (keyframe) {
    // Keyframe-accelerated rebuild
    document = structuredClone(keyframe.document);
    startRevision = keyframe.revision;
    console.log(`Cold miss: starting from keyframe@${startRevision}`);
  } else {
    // Full rebuild from scratch
    document = null; // Will be initialized from CREATE_DOCUMENT
    startRevision = 0;
    console.log(`Cold miss: no keyframe, rebuilding from scratch`);
  }

  // Stream and apply operations from startRevision
  const reducer = this.registry.getModule(documentType).reducer;
  // ... rest of streaming logic ...
}
```

**Acceptance Criteria:**
- Checks for keyframes first (optimization)
- Falls back to full rebuild if no keyframe
- Correctly streams operations from keyframe revision
- Applies operations through reducer incrementally
- Respects targetRevision stopping point
- Handles abort signal properly
- Does not load all operations into memory at once

### Task 6.4: Integrate cold miss into getState
- [ ] Update `getState` to detect cold miss (no stream in cache)
- [ ] Call `coldMissRebuild` on cold miss
- [ ] Store result in cache using `putState`
- [ ] Return built document
- [ ] Handle errors during rebuild

**Acceptance Criteria:**
- Cold miss triggers rebuild
- Result automatically cached
- Errors propagate correctly

### Task 6.5: Create cold miss tests with keyframe scenarios
- [ ] Create test document with 250 operations (requires paging)
- [ ] Test: should rebuild document from scratch on cold miss (no keyframe)
- [ ] Test: should use cursor-based paging for large operation sets
- [ ] Test: should stop at targetRevision if specified
- [ ] Test: should cache result after rebuild
- [ ] Test: should apply operations through reducer correctly
- [ ] Test: should handle abort signal during rebuild
- [ ] **NEW** Test: should use keyframe if available (keyframe-accelerated rebuild)
- [ ] **NEW** Test: should rebuild from keyframe + incremental ops
- [ ] **NEW** Test: should fall back to full rebuild if keyframe corrupted
- [ ] **NEW** Test: should find nearest keyframe (e.g., load @40 for target @47)

**Test Scenario:**
```typescript
// Setup: Put document at rev 10, 20, 30, 40, 50 (all are keyframes)
// Cold start (empty cache)
await cache.getState(docId, type, scope, branch, 47);
// Should:
// 1. Check K/V store for keyframes: 40, 30, 20, 10
// 2. Find keyframe@40
// 3. Load operations 41-47
// 4. Return document@47
```

**Acceptance Criteria:**
- Tests use real document-drive or document-model operations
- Tests verify paging behavior with >100 operations
- Tests verify document is correctly rebuilt
- Tests verify result is cached
- Tests verify keyframe optimization works
- Tests verify fallback to full rebuild

## Phase 7: Warm Miss Rebuild

### Task 7.1: Implement warm miss rebuild
- [ ] Add private method `warmMissRebuild(baseDocument, baseRevision, documentId, documentType, scope, branch, targetRevision, signal): Promise<PHDocument>`
- [ ] Deep copy base document
- [ ] Get reducer from registry
- [ ] Load operations using `operationStore.getSince(documentId, scope, branch, baseRevision, undefined, signal)`
- [ ] Omit paging parameter (warm miss range typically small)
- [ ] Apply incremental operations through reducer
- [ ] Stop at targetRevision if specified
- [ ] Return updated document

**Acceptance Criteria:**
- Only loads operations after base revision
- Applies operations incrementally
- Respects targetRevision
- Handles abort signal

### Task 7.2: Integrate warm miss into getState
- [ ] Update `getState` to detect warm miss (has older revision)
- [ ] Find newest cached snapshot < targetRevision using ring buffer's findNearest
- [ ] Call `warmMissRebuild` with cached document
- [ ] Store result in cache
- [ ] Return built document

**Acceptance Criteria:**
- Warm miss uses cached starting point
- Result automatically cached
- More efficient than cold miss

### Task 7.3: Create warm miss tests
- [ ] Test: should use cached base revision for warm miss
- [ ] Test: should only load operations after base revision
- [ ] Test: should build to exact targetRevision
- [ ] Test: should cache result after warm rebuild
- [ ] Test: should handle multiple revisions in ring buffer
- [ ] Test: should choose nearest older revision as base

**Acceptance Criteria:**
- Tests verify only incremental operations loaded
- Tests verify correct base revision selected
- Tests verify result correctness

## Phase 8: Cache Management

### Task 8.1: Implement invalidate method
- [ ] Implement `invalidate(documentId, scope?, branch?): number`
- [ ] Handle case: only documentId (invalidate all scopes/branches)
- [ ] Handle case: documentId + scope (invalidate all branches for scope)
- [ ] Handle case: documentId + scope + branch (invalidate specific stream)
- [ ] Remove streams from cache Map
- [ ] Remove from LRU tracker
- [ ] Return count of ring buffers evicted

**Acceptance Criteria:**
- All three invalidation scopes work correctly
- LRU tracker updated
- Returns correct eviction count

### Task 8.2: Implement clear method
- [ ] Implement `clear(): void`
- [ ] Clear streams Map
- [ ] Clear LRU tracker
- [ ] Reset any internal state

**Acceptance Criteria:**
- Cache completely emptied
- Subsequent operations work correctly

### Task 8.3: Create cache management tests
- [ ] Test: should invalidate all streams for a document
- [ ] Test: should invalidate streams for specific scope
- [ ] Test: should invalidate specific stream
- [ ] Test: should return correct eviction count
- [ ] Test: should clear entire cache
- [ ] Test: should handle invalidate of non-existent stream

**Acceptance Criteria:**
- All invalidation patterns tested
- Tests verify LRU cleanup

## Phase 9: Integration Tests

### Task 9.1: Create end-to-end integration test
- [ ] Create `packages/reactor/test/cache/write-cache-integration.test.ts`
- [ ] Set up real KyselyOperationStore with PGLite
- [ ] Set up DocumentModelRegistry with document-drive module
- [ ] Create KyselyWriteCache instance
- [ ] Test full flow: cold miss -> cache hit -> warm miss
- [ ] Test with real document-drive operations (addFolder, addFile, etc.)
- [ ] Verify document state correctness at each step

**Acceptance Criteria:**
- Uses real IOperationStore implementation
- Uses real document model (document-drive)
- Verifies cache behavior in realistic scenario
- Tests complete read-apply-write cycle

### Task 9.2: Create multi-document stress test
- [ ] Test: should handle 10+ documents with different streams
- [ ] Test: should correctly evict LRU documents when at capacity
- [ ] Test: should maintain correctness under eviction pressure
- [ ] Test: should handle concurrent getState calls (same document)
- [ ] Test: should handle interleaved puts and gets

**Acceptance Criteria:**
- Tests verify cache remains consistent
- Tests verify LRU behavior under load
- Tests use realistic cache capacity limits

### Task 9.3: Create error handling tests
- [ ] Test: should handle operations that fail reducer application
- [ ] Test: should handle abort signal at various points
- [ ] Test: should handle invalid document type (not in registry)
- [ ] Test: should handle operations that produce errors
- [ ] Test: should propagate operation store errors

**Acceptance Criteria:**
- All error paths tested
- Errors don't corrupt cache state
- Appropriate error messages

## Phase 10: Factory and Test Utilities

### Task 10.1: Add factory function
- [ ] Add `createTestWriteCache()` to `packages/reactor/test/factories.ts`
- [ ] Create KyselyOperationStore with PGLite
- [ ] Create DocumentModelRegistry with test modules
- [ ] Create KyselyWriteCache with test config
- [ ] Return all instances for testing
- [ ] Add cleanup utilities

**Acceptance Criteria:**
- Factory simplifies test setup
- Returns all necessary dependencies
- Includes cleanup helpers

### Task 10.2: Update existing tests to use cache
- [ ] Review job executor tests
- [ ] Identify tests that would benefit from write cache
- [ ] Add write cache to test setup where appropriate
- [ ] Verify cache improves test performance

**Acceptance Criteria:**
- Tests demonstrate cache benefits
- Tests remain deterministic
- No test regressions

## Phase 11: Documentation and Examples

### Task 11.1: Add usage examples
- [ ] Create `packages/reactor/docs/planning/Cache/kysely-write-cache-usage.md`
- [ ] Document initialization with PGLite
- [ ] Document initialization with PostgreSQL
- [ ] Document job executor integration pattern
- [ ] Document configuration options
- [ ] Document cache monitoring/debugging

**Acceptance Criteria:**
- Examples are copy-pasteable
- Examples cover common use cases
- Examples show both PGLite and PostgreSQL

### Task 11.2: Add inline code documentation
- [ ] Add comprehensive JSDoc to KyselyWriteCache class
- [ ] Document private methods
- [ ] Add examples to key methods
- [ ] Document performance characteristics
- [ ] Document thread-safety considerations

**Acceptance Criteria:**
- All public methods have JSDoc
- JSDoc includes @param and @returns
- Key algorithms explained

## Phase 12: Performance Validation

### Task 12.1: Create performance benchmark
- [ ] Create `packages/reactor/bench/write-cache.bench.ts`
- [ ] Benchmark: cold miss rebuild (100 operations)
- [ ] Benchmark: cold miss rebuild (1000 operations)
- [ ] Benchmark: cache hit performance
- [ ] Benchmark: warm miss rebuild (10 incremental ops)
- [ ] Benchmark: LRU eviction performance
- [ ] Compare with no-cache baseline

**Acceptance Criteria:**
- Uses vitest bench framework
- Establishes performance baselines
- Cache shows measurable improvement

### Task 12.2: Memory profiling
- [ ] Add memory usage tracking to benchmarks
- [ ] Test: ring buffer memory usage with different sizes
- [ ] Test: LRU tracker memory overhead
- [ ] Test: overall cache memory footprint
- [ ] Document memory characteristics

**Acceptance Criteria:**
- Memory usage within expected bounds
- No memory leaks detected
- Ring buffer size recommendations documented

## Phase 13: Additional K/V Store Implementations (Optional)

### Task 13.1: Create RedisKeyValueStore (Server-side)
- [ ] Create `packages/reactor/src/cache/redis-kv-store.ts`
- [ ] Implement IKeyValueStore using Redis client
- [ ] Add dependency: `ioredis` or `redis`
- [ ] Implement all methods: get, put, delete, clear, startup, shutdown
- [ ] Handle connection management
- [ ] Handle Redis errors gracefully

**Implementation notes:**
```typescript
import Redis from 'ioredis';

export class RedisKeyValueStore implements IKeyValueStore {
  private client: Redis;

  constructor(private config: RedisConfig) {
    this.client = new Redis(config);
  }

  async get(key: string, signal?: AbortSignal): Promise<string | undefined> {
    const value = await this.client.get(key);
    return value || undefined;
  }

  // ... other methods
}
```

**Acceptance Criteria:**
- Implements IKeyValueStore interface
- Handles connection errors
- Proper startup/shutdown lifecycle
- Tests with real Redis (or Redis mock)

### Task 13.2: Create IndexedDBKeyValueStore (Browser-side)
- [ ] Create `packages/reactor-browser/src/cache/indexeddb-kv-store.ts`
- [ ] Implement IKeyValueStore using IndexedDB API
- [ ] Handle browser compatibility
- [ ] Implement all methods
- [ ] Handle quota errors gracefully

**Implementation notes:**
```typescript
export class IndexedDBKeyValueStore implements IKeyValueStore {
  private db: IDBDatabase | undefined;
  private dbName: string;

  constructor(dbName: string = 'reactor-cache') {
    this.dbName = dbName;
  }

  async startup(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        db.createObjectStore('keyframes');
      };
    });
  }

  // ... other methods
}
```

**Acceptance Criteria:**
- Works in browser environment
- Handles IndexedDB quotas
- Proper error handling
- Tests in browser-like environment

### Task 13.3: Document K/V store selection guide
- [ ] Create `docs/planning/Cache/kv-store-guide.md`
- [ ] Document when to use each implementation
- [ ] Document configuration options
- [ ] Document performance characteristics
- [ ] Document limitations

**Selection guide:**
- **InMemoryKeyValueStore**: Testing, development, single-process
- **RedisKeyValueStore**: Production servers, multi-process, shared cache
- **IndexedDBKeyValueStore**: Browser environments, offline-first apps

**Acceptance Criteria:**
- Clear guidance on implementation selection
- Performance comparison documented
- Configuration examples provided

## Phase 14: Final Integration

### Task 14.1: Export from main package
- [ ] Update `packages/reactor/src/index.ts` with all cache exports
- [ ] Export KyselyWriteCache class
- [ ] Export IKeyValueStore interface
- [ ] Export InMemoryKeyValueStore class
- [ ] Export all types and interfaces
- [ ] Update package README if needed

**Acceptance Criteria:**
- All exports properly typed
- Package builds successfully
- Exports follow package conventions

### Task 14.2: Add to reactor initialization
- [ ] Document how to add write cache to Reactor
- [ ] Show integration with job executor
- [ ] Document cache lifecycle (startup/shutdown)
- [ ] Add cache configuration to ReactorBuilder if applicable

**Acceptance Criteria:**
- Clear integration path documented
- Cache fits into reactor lifecycle
- No breaking changes to existing APIs

### Task 14.3: Final validation
- [ ] Run full test suite: `pnpm test`
- [ ] Run type checking: `pnpm tsc --build`
- [ ] Run linter: `pnpm lint`
- [ ] Verify all tests pass
- [ ] Verify no type errors
- [ ] Verify code follows project conventions

**Acceptance Criteria:**
- All tests pass (unit, integration, benchmarks)
- No TypeScript errors
- No linting errors
- Code follows CLAUDE.md guidelines

## Completion Checklist

### Core Implementation (Required)
- [ ] Phase 0: IKeyValueStore interface + InMemoryKeyValueStore
- [ ] Phases 1-12: Core cache implementation with keyframe support
- [ ] Phase 14: Final integration and validation
- [ ] All tests passing
- [ ] Documentation complete
- [ ] Performance validated
- [ ] Code reviewed and follows conventions
- [ ] Ready for integration with job executor

### Extended Implementations (Optional)
- [ ] Phase 13: RedisKeyValueStore implementation
- [ ] Phase 13: IndexedDBKeyValueStore implementation
- [ ] Phase 13: K/V store selection guide

## Notes

- Each task should be completed and tested before moving to the next
- Run `pnpm tsc --build` after each file creation
- Run relevant tests after each implementation task
- Follow project conventions from CLAUDE.md:
  - Never use `any` or `unknown` types
  - Prefer named types over Pick/Omit
  - Separate try/catch blocks for each await
  - Group public methods before private methods
  - Prefer required fields with defaults over optional fields
- **Write-side projection**: IWriteCache optimizes job executor (write path)
- **Read-side projection**: IDocumentView optimizes queries (read path)
- **Keyframes**: Persist every Nth revision to K/V store for fast recovery
- **Lazy loading**: Don't pre-warm cache on startup, load keyframes on demand

## Success Metrics

1. **Cache hit rate** >80% in job executor scenarios
2. **Keyframe acceleration**: Cold miss rebuild 10x faster with keyframes vs. full rebuild
3. **Operation handling**: Efficiently handles documents with 1000+ operations
4. **Memory usage**: Scales linearly with cache size (ring buffer + LRU)
5. **K/V store overhead**: Keyframe persistence adds <5% overhead to putState
6. **Test coverage**: All tests maintain >90% coverage
7. **Zero corruption**: No cache corruption or inconsistency bugs
