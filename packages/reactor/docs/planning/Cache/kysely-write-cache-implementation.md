# IWriteCache Implementation Plan - Write-Side Projection

This document provides a step-by-step implementation plan for the IWriteCache as a write-side projection. The plan is broken down into manageable tasks suitable for iterative LLM implementation.

## Overview

The IWriteCache is a **write-side projection** that optimizes document state retrieval for the job executor. It uses a three-layer storage strategy:

1. **In-Memory Layer**: Ring buffer storing all recent document revisions (ephemeral, fast)
2. **Keyframe Store Layer**: Keyframe snapshots persisted every N revisions to database (durable, indexed, O(log n) lookups)
3. **Rebuild Layer**: Falls back to rebuilding from IOperationStore using reducers (cold start)

This is separate from IDocumentView (read-side projection) which optimizes queries and searches.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    IWriteCache                          │
│                 (Write-Side Projection)                 │
├─────────────────────────────────────────────────────────┤
│  In-Memory: Ring buffer (all recent revisions)          │
│  Keyframe Store: Keyframes (every Nth revision)         │
│  Fallback:  Rebuild from operations + reducer           │
└─────────────────────────────────────────────────────────┘
         │                │                 │
         │                │                 │
         v                v                 v
   Ring Buffer      IKeyframeStore    IOperationStore
   (ephemeral)    (Kysely/PGLite/Postgres) + Registry
```

## Dependencies

- `packages/reactor/src/storage/interfaces.ts` - IOperationStore, IKeyframeStore, PagedResults, PagingOptions
- `packages/reactor/src/storage/kysely/keyframe-store.ts` - KyselyKeyframeStore (database-backed implementation)
- `packages/reactor/src/registry/interfaces.ts` - IDocumentModelRegistry
- `document-model` - PHDocument, Operation, DocumentModelModule

## Phase 0: Keyframe Store (Database-Backed)

### Overview

The keyframe store has been implemented as a database-backed persistent storage layer using Kysely and PGLite/PostgreSQL.

### Task 0.1: Create IKeyframeStore interface
- [x] Added `IKeyframeStore` interface to `packages/reactor/src/storage/interfaces.ts`
- [x] Define methods:
  - `putKeyframe(documentId, documentType, scope, branch, revision, document, signal): Promise<void>`
  - `findNearestKeyframe(documentId, scope, branch, targetRevision, signal): Promise<{revision, document} | undefined>`
  - `deleteKeyframes(documentId, scope?, branch?, signal?): Promise<number>`
- [x] All methods properly typed with comprehensive JSDoc

**Acceptance Criteria:**
- Interface provides keyframe storage abstraction
- All methods properly typed
- findNearestKeyframe uses O(log n) indexed SQL query (not O(n) iteration)

### Task 0.2: Create KyselyKeyframeStore implementation
- [x] Created `packages/reactor/src/storage/kysely/keyframe-store.ts`
- [x] Implemented using Kysely query builder with Keyframe table
- [x] putKeyframe: Inserts or updates keyframe with onConflict handling
- [x] findNearestKeyframe: Uses indexed SQL query with WHERE revision <= targetRevision ORDER BY revision DESC LIMIT 1
- [x] deleteKeyframes: Supports deletion by document, scope, or specific stream
- [x] Exports as part of storage layer

**Acceptance Criteria:**
- Efficient SQL queries using database indexes
- O(log n) lookup performance for findNearestKeyframe
- Handles JSON serialization/deserialization of PHDocument
- Proper error handling and abort signal support

### Task 0.3: Add Keyframe table schema
- [x] Updated `packages/reactor/src/storage/kysely/types.ts`
- [x] Added KeyframeTable interface with columns:
  - `id` (serial primary key)
  - `documentId` (text, indexed)
  - `documentType` (text)
  - `scope` (text, indexed)
  - `branch` (text, indexed)
  - `revision` (integer, indexed)
  - `document` (text, JSON-serialized PHDocument)
  - `createdAt` (timestamp)
- [x] Added unique constraint on (documentId, scope, branch, revision)
- [x] Added composite index on (documentId, scope, branch, revision) for fast lookups

**Acceptance Criteria:**
- Schema supports efficient keyframe queries
- Unique constraint prevents duplicate keyframes
- Index optimizes findNearestKeyframe performance

### Task 0.4: Create comprehensive tests
- [x] Created `packages/reactor/test/storage/kysely-keyframe-store.test.ts`
- [x] 23 tests covering:
  - putKeyframe: store, update on conflict, multiple keyframes, different scopes/branches, abort signal
  - findNearestKeyframe: exact match, nearest match, missing keyframes, different scopes/branches, JSON deserialization, abort signal
  - deleteKeyframes: specific stream, scope-level, document-level, isolation, abort signal
  - Integration scenarios: full lifecycle, efficient lookup among many revisions

**Acceptance Criteria:**
- All tests pass with `pnpm test`
- Tests use real PGLite database (not mocks)
- 100% coverage on KyselyKeyframeStore class
- Tests verify performance characteristics

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
- [x] Create `packages/reactor/src/cache/buffer/ring-buffer.ts`
- [x] Implement generic `RingBuffer<T>` class with:
  - Private `buffer: T[]`
  - Private `head: number = 0`
  - Private `size: number = 0`
  - Private `capacity: number`
- [x] Implement `constructor(capacity: number)`
- [x] Implement `push(item: T): void` method (circular overwrite)
- [x] Implement `getAll(): T[]` method (returns items in chronological order)
- [x] Implement `clear(): void` method
- [x] Implement `get length(): number` getter

**Acceptance Criteria:**
- Class properly handles circular buffer logic
- getAll() returns items in insertion order (oldest to newest)
- All methods use classical OOP patterns (no Pick/Omit)

### Task 2.2: Create RingBuffer unit tests
- [x] Create `packages/reactor/test/cache/buffer/ring-buffer.test.ts`
- [x] Test: should initialize with correct capacity
- [x] Test: should add items sequentially
- [x] Test: should overwrite oldest item when full
- [x] Test: should return items in chronological order
- [x] Test: should handle edge case of capacity=1
- [x] Test: should clear all items
- [x] Test: should track size correctly

**Acceptance Criteria:**
- All tests pass with `pnpm test`
- 100% code coverage on RingBuffer class
- Tests use vitest framework

## Phase 3: LRU Cache Implementation

### Task 3.1: Create LRU tracker
- [x] Create `packages/reactor/src/cache/lru/lru-tracker.ts`
- [x] Implement `LRUTracker<K>` class using Map for O(1) operations
- [x] Track access order with doubly-linked list structure
- [x] Implement `touch(key: K): void` - mark as most recently used
- [x] Implement `evict(): K | undefined` - return least recently used key
- [x] Implement `remove(key: K): void` - remove specific key from tracking
- [x] Implement `clear(): void` - reset tracker
- [x] Implement `get size(): number` getter

**Acceptance Criteria:**
- O(1) time complexity for touch operation
- O(1) time complexity for evict operation
- Classical OOP implementation

### Task 3.2: Create LRU tracker unit tests
- [x] Create `packages/reactor/test/cache/lru/lru-tracker.test.ts`
- [x] Test: should track most recently used items
- [x] Test: should evict least recently used item
- [x] Test: should handle touch updating order
- [x] Test: should handle removal of tracked items
- [x] Test: should clear all tracked items
- [x] Test: should maintain correct size
- [x] Test: should handle edge cases (empty, single item)

**Acceptance Criteria:**
- All tests pass
- Tests verify LRU ordering behavior
- 100% code coverage

## Phase 4: Core Cache Structure

### Task 4.1: Create cache storage structure
- [x] Create `packages/reactor/src/cache/kysely-write-cache.ts`
- [x] Define `DocumentStream` type (key + ringBuffer)
- [x] Create `KyselyWriteCache` class implementing `IWriteCache`
- [x] Add private fields:
  - `streams: Map<string, DocumentStream>` (in-memory ring buffers)
  - `lruTracker: LRUTracker<string>` (LRU tracking)
  - `keyframeStore: IKeyframeStore` (persistent keyframe storage)
  - `operationStore: IOperationStore` (fallback rebuild)
  - `registry: IDocumentModelRegistry` (reducer access)
  - `config: Required<WriteCacheConfig>` (configuration)
- [x] Implement constructor accepting dependencies
- [x] Implement `startup(): Promise<void>`:
  - Simple initialization, no pre-warming
  - Keyframe store lifecycle managed externally
- [x] Implement `shutdown(): Promise<void>`:
  - Simple cleanup
  - Keyframe store lifecycle managed externally

**Acceptance Criteria:**
- Class structure follows patterns from KyselyOperationStore
- Required config type ensures no undefined values
- All private fields properly typed
- Public methods listed before private methods
- Startup/shutdown are simple (keyframe store managed externally)

### Task 4.2: Implement cache key utilities
- [x] Add private method `makeStreamKey(documentId, scope, branch): string`
- [x] Implement consistent string serialization (e.g., `${documentId}:${scope}:${branch}`)
- [x] Add private method `getOrCreateStream(key: string): DocumentStream`
- [x] Implement LRU eviction when maxDocuments reached

**Acceptance Criteria:**
- Key generation is deterministic and unique
- Eviction triggers at correct capacity
- Tests verify key generation consistency

### Task 4.3: Implement keyframe utilities
- [x] Add private method `isKeyframeRevision(revision: number): boolean`
- [x] Returns `revision > 0 && revision % config.keyframeInterval === 0`
- [x] Keyframe serialization/deserialization handled by IKeyframeStore (not in cache)

**Acceptance Criteria:**
- Keyframe interval checking works correctly
- Serialization delegated to keyframe store layer

### Task 4.4: Implement putState with keyframe logic
- [x] Implement `putState(documentId, documentType, scope, branch, revision, document): void`
- [x] Deep copy document using `structuredClone()`
- [x] Create stream key from parameters
- [x] Get or create document stream
- [x] Add snapshot to ring buffer (always)
- [x] Update LRU tracker
- [x] Handle eviction when at capacity
- [x] Check if keyframe revision using `isKeyframeRevision(revision)`
- [x] If keyframe, persist to IKeyframeStore asynchronously
  - Don't await (fire and forget)
  - Log errors but don't fail putState

**Implementation:**
```typescript
putState(...): void {
  // ... existing logic ...

  // Keyframe persistence
  if (this.isKeyframeRevision(revision)) {
    this.keyframeStore.putKeyframe(
      documentId,
      documentType,
      scope,
      branch,
      revision,
      safeCopy
    ).catch(err => {
      console.error(`Failed to persist keyframe ${documentId}@${revision}:`, err);
    });
  }
}
```

**Acceptance Criteria:**
- Documents are deep copied (mutations don't affect cache)
- LRU tracking updated on every put
- Eviction logic correctly removes entire ring buffers
- Keyframes persisted to keyframe store on interval
- Keyframe persistence doesn't block putState

### Task 4.5: Create basic cache tests
- [x] Create `packages/reactor/test/cache/kysely-write-cache.test.ts`
- [x] Test: should store and track documents
- [x] Test: should deep copy documents on put
- [x] Test: should evict LRU stream when at capacity
- [x] Test: should maintain ring buffer per stream
- [x] Test: should handle multiple scopes/branches separately

**Acceptance Criteria:**
- Tests use mock implementations for dependencies
- Tests verify deep copy behavior
- Tests verify LRU eviction
- All 18 tests passing

## Phase 5: Cache Hit Path (getState)

### Task 5.1: Implement cache hit path
- [x] Implement basic `getState` with cache hit logic:
  - Check abort signal
  - Make stream key
  - Look up stream in cache
  - If found, search ring buffer for matching revision
  - If exact match or newest, deep copy and return
  - Update LRU tracker on hit
  - Return cached document (deep copied)
- [x] Handle targetRevision undefined (return newest)
- [x] Handle exact revision match
- [x] Throw placeholder error for cache miss (Phase 6)

**Acceptance Criteria:**
- Cache hits return correct document
- Documents are deep copied on return
- LRU updated on cache hit
- Handles abort signal

### Task 5.2: Create cache hit tests
- [x] Test: should return exact revision match on cache hit
- [x] Test: should return newest snapshot when targetRevision undefined
- [x] Test: should return deep copy (mutations don't affect cache)
- [x] Test: should update LRU on cache hit
- [x] Test: should respect abort signal
- [x] Test: should handle cache miss (expect placeholder error)

**Acceptance Criteria:**
- All cache hit scenarios covered
- Deep copy behavior verified
- LRU behavior verified
- All 6 new tests passing (24 total cache tests)

## Phase 6: Cold Miss Rebuild (with Keyframe Optimization)

### Task 6.1: Implement findNearestKeyframe helper
- [x] Add private method `findNearestKeyframe(documentId, documentType, scope, branch, targetRevision, signal): Promise<{revision: number, document: PHDocument} | undefined>`
- [x] Delegate to `IKeyframeStore.findNearestKeyframe()` with indexed SQL query
- [x] Handle edge cases (Number.MAX_SAFE_INTEGER, revision <= 0)
- [x] Return keyframe or undefined if none found

**Implementation:**
```typescript
private async findNearestKeyframe(
  documentId: string,
  documentType: string,
  scope: string,
  branch: string,
  targetRevision: number,
  signal?: AbortSignal
): Promise<{ revision: number; document: PHDocument } | undefined> {
  if (targetRevision === Number.MAX_SAFE_INTEGER || targetRevision <= 0) {
    return undefined;
  }

  return this.keyframeStore.findNearestKeyframe(
    documentId,
    scope,
    branch,
    targetRevision,
    signal
  );
}
```

**Acceptance Criteria:**
- Finds nearest keyframe <= targetRevision using O(log n) indexed SQL query
- Returns newest available keyframe
- Handles edge cases (MAX_SAFE_INTEGER, zero/negative revisions)
- Returns undefined if no keyframes exist
- Significantly more efficient than O(n) K/V store iteration

### ~~Task 6.2: Implement createInitialDocument helper~~
- ~~[ ] Add private method `createInitialDocument(documentId, documentType, operation): PHDocument`~~
- ~~[ ] Get module from registry~~
- ~~[ ] Use module's document model utilities to create initial document~~
- ~~[ ] Apply first operation if needed~~
- ~~[ ] Return initialized document~~

~~**Acceptance Criteria:**~~
- ~~Method creates valid PHDocument~~
- ~~Integrates with IDocumentModelRegistry correctly~~
- ~~Handles different document types~~

### Task 6.3: Implement cold miss rebuild with keyframe optimization
- [x] Add private method `coldMissRebuild(documentId, documentType, scope, branch, targetRevision, signal): Promise<PHDocument>`
- [x] **NEW**: First, try to find nearest keyframe using `findNearestKeyframe()`
- [x] If keyframe found, use it as starting point (keyframe-accelerated rebuild)
- [x] If no keyframe, rebuild from scratch
- [x] Get reducer from registry using `registry.getModule(documentType).reducer`
- [x] Stream operations using `operationStore.getSince(documentId, scope, branch, startRevision, paging, signal)`
  - startRevision = keyframe.revision if keyframe found, else 0
- [x] Use cursor-based paging with pageSize=100
- [x] Apply operations incrementally through reducer
- [x] Stop when targetRevision reached (if specified)
- [x] Handle abort signal between pages
- [x] Return built document

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
- [x] Update `getState` to detect cold miss (no stream in cache)
- [x] Call `coldMissRebuild` on cold miss
- [x] Store result in cache using `putState`
- [x] Return built document
- [x] Handle errors during rebuild

**Acceptance Criteria:**
- Cold miss triggers rebuild
- Result automatically cached
- Errors propagate correctly

### Task 6.5: Create cold miss tests with keyframe scenarios
- [x] Create test document with 250 operations (requires paging)
- [x] Test: should rebuild document from scratch on cold miss (no keyframe)
- [x] Test: should use cursor-based paging for large operation sets
- [x] Test: should stop at targetRevision if specified
- [x] Test: should cache result after rebuild
- [x] Test: should apply operations through reducer correctly
- [x] Test: should handle abort signal during rebuild
- [x] Test: should use keyframe if available (keyframe-accelerated rebuild)
- [x] Test: should rebuild from keyframe + incremental ops
- [x] Test: should persist keyframes at configured interval
- [x] Test: should find nearest keyframe using IKeyframeStore

**Test Scenario:**
```typescript
// Setup: Put document at rev 10, 20, 30, 40, 50 (all are keyframes)
// Cold start (empty cache)
await cache.getState(docId, type, scope, branch, 47);
// Should:
// 1. Call IKeyframeStore.findNearestKeyframe(docId, scope, branch, 47)
// 2. Keyframe store uses indexed SQL query: WHERE revision <= 47 ORDER BY revision DESC LIMIT 1
// 3. Find keyframe@40 (O(log n) lookup)
// 4. Load operations 41-47
// 5. Return document@47
```

**Acceptance Criteria:**
- Tests use real document-model operations
- Tests verify paging behavior with >100 operations
- Tests verify document is correctly rebuilt
- Tests verify result is cached
- Tests verify keyframe optimization works using IKeyframeStore
- Tests verify keyframe persistence at intervals

## Phase 7: Warm Miss Rebuild

### Task 7.1: Implement warm miss rebuild
- [x] Add private method `warmMissRebuild(baseDocument, baseRevision, documentId, documentType, scope, branch, targetRevision, signal): Promise<PHDocument>`
- [x] Deep copy base document
- [x] Get reducer from registry
- [x] Load operations using `operationStore.getSince(documentId, scope, branch, baseRevision, undefined, signal)`
- [x] Omit paging parameter (warm miss range typically small)
- [x] Apply incremental operations through reducer
- [x] Stop at targetRevision if specified
- [x] Return updated document

**Acceptance Criteria:**
- Only loads operations after base revision
- Applies operations incrementally
- Respects targetRevision
- Handles abort signal

### Task 7.2: Integrate warm miss into getState
- [x] Update `getState` to detect warm miss (has older revision)
- [x] Find newest cached snapshot < targetRevision using ring buffer's findNearest
- [x] Call `warmMissRebuild` with cached document
- [x] Store result in cache
- [x] Return built document

**Acceptance Criteria:**
- Warm miss uses cached starting point
- Result automatically cached
- More efficient than cold miss

### Task 7.3: Create warm miss tests
- [x] Test: should use cached base revision for warm miss
- [x] Test: should only load operations after base revision
- [x] Test: should build to exact targetRevision
- [x] Test: should cache result after warm rebuild
- [x] Test: should handle multiple revisions in ring buffer
- [x] Test: should choose nearest older revision as base
- [x] Test: should handle warm miss with abort signal

**Acceptance Criteria:**
- Tests verify only incremental operations loaded
- Tests verify correct base revision selected
- Tests verify result correctness

## Phase 8: Cache Management

### Task 8.1: Implement invalidate method
- [x] Implement `invalidate(documentId, scope?, branch?): number`
- [x] Handle case: only documentId (invalidate all scopes/branches)
- [x] Handle case: documentId + scope (invalidate all branches for scope)
- [x] Handle case: documentId + scope + branch (invalidate specific stream)
- [x] Remove streams from cache Map
- [x] Remove from LRU tracker
- [x] Return count of ring buffers evicted

**Acceptance Criteria:**
- All three invalidation scopes work correctly
- LRU tracker updated
- Returns correct eviction count

### Task 8.2: Implement clear method
- [x] Implement `clear(): void`
- [x] Clear streams Map
- [x] Clear LRU tracker
- [x] Reset any internal state

**Acceptance Criteria:**
- Cache completely emptied
- Subsequent operations work correctly

### Task 8.3: Create cache management tests
- [x] Test: should invalidate all streams for a document
- [x] Test: should invalidate streams for specific scope
- [x] Test: should invalidate specific stream
- [x] Test: should return correct eviction count
- [x] Test: should clear entire cache
- [x] Test: should handle invalidate of non-existent stream

**Acceptance Criteria:**
- All invalidation patterns tested
- Tests verify LRU cleanup

## Phase 9: Integration Tests

### Task 9.1: Create end-to-end integration test
- [x] Create `packages/reactor/test/cache/write-cache-integration.test.ts`
- [x] Set up real KyselyOperationStore with PGLite
- [x] Set up DocumentModelRegistry with document-drive module
- [x] Create KyselyWriteCache instance
- [x] Test full flow: cold miss -> cache hit -> warm miss
- [x] Test with real document-drive operations (addFolder, addFile, etc.)
- [x] Verify document state correctness at each step

**Acceptance Criteria:**
- Uses real IOperationStore implementation
- Uses real document model (document-drive)
- Verifies cache behavior in realistic scenario
- Tests complete read-apply-write cycle

### Task 9.2: Create error handling tests
- [x] Test: should handle operations that fail reducer application
- [x] Test: should handle abort signal at various points
- [x] Test: should handle invalid document type (not in registry)
- [x] Test: should handle operations that produce errors
- [x] Test: should propagate operation store errors

**Acceptance Criteria:**
- [x] All error paths tested (30 tests created covering all scenarios)
- [x] Errors don't corrupt cache state (verified in tests)
- [x] Appropriate error messages (all errors include context)

## Phase 10: Factory and Test Utilities

### Task 10.1: Add factory function
- [x] Add `createTestWriteCache()` to `packages/reactor/test/factories.ts` (implemented as `createTestOperationStore`)
- [x] Create KyselyOperationStore with PGLite
- [x] Create DocumentModelRegistry with test modules (via `createTestRegistry`)
- [x] Create KyselyWriteCache with test config (tests instantiate directly)
- [x] Return all instances for testing
- [x] Add cleanup utilities (db.destroy() used in test cleanup)

**Acceptance Criteria:**
- [x] Factory simplifies test setup (used in 9 test files)
- [x] Returns all necessary dependencies ({ db, store, keyframeStore })
- [x] Includes cleanup helpers (db.destroy() in afterEach hooks)

**Implementation Notes:**
Factory exists as `createTestOperationStore()` at test/factories.ts:47-131. Tests use `createTestRegistry()` for registry and instantiate KyselyWriteCache directly. This pattern works well and is used consistently across all cache tests.

## Phase 11: Documentation and Examples

### Task 11.1: Add usage examples
- [x] ~~Create kysely-write-cache-usage.md~~ (SKIPPED - redundant with write-cache.md)
- [x] Document initialization with PGLite (covered in write-cache.md spec)
- [x] Document initialization with PostgreSQL (covered in write-cache.md spec)
- [x] Document job executor integration pattern (covered in write-cache.md spec)
- [x] Document configuration options (covered in write-cache-interface.md)
- [x] Document cache monitoring/debugging (covered in error handling section)

**Acceptance Criteria:**
- [x] Examples are copy-pasteable (write-cache.md contains full examples)
- [x] Examples cover common use cases (job executor integration shown)
- [x] Examples show both PGLite and PostgreSQL (covered in spec)

**Decision:** Skipped separate usage doc. The specification in write-cache.md already contains comprehensive examples with mermaid diagrams, code samples, and architecture details. Creating a separate usage doc would duplicate existing content.

### Task 11.2: Add inline code documentation
- [x] Add comprehensive JSDoc to KyselyWriteCache class
- [x] Document private methods (inline comments explain logic)
- [x] Add examples to key methods (class JSDoc includes usage example)
- [x] Document performance characteristics (class JSDoc includes O(n) analysis)
- [x] Document thread-safety considerations (class JSDoc warns about single-threaded use)

**Acceptance Criteria:**
- [x] All public methods have JSDoc (startup, shutdown, getState, putState, invalidate, clear)
- [x] JSDoc includes @param and @returns (all methods documented)
- [x] Key algorithms explained (inline comments for error handling, keyframe logic)

## Phase 14: Final Integration

### Task 14.1: Export from main package
- [ ] Export KyselyWriteCache class from `src/cache/kysely-write-cache.ts`
- [ ] Export IKeyframeStore interface from `src/storage/interfaces.ts`
- [ ] Export KyselyKeyframeStore class from `src/storage/kysely/keyframe-store.ts`
- [ ] Verify cache types already exported (CachedSnapshot, DocumentStreamKey, KeyframeSnapshot, WriteCacheConfig)
- [ ] Verify IWriteCache already exported from `src/cache/write/interfaces.ts`
- [ ] Update package README if needed

**Acceptance Criteria:**
- All exports properly typed
- Package builds successfully
- Exports follow package conventions

### Task 14.2: Add to reactor initialization

#### Code Integration
- [ ] Add `IWriteCache` parameter to `SimpleJobExecutor` constructor
- [ ] Update executor factory in integration tests to provide cache instance
- [ ] Replace `documentStorage.get(job.documentId)` with `writeCache.getState(job.documentId, documentType, job.scope, job.branch)` in regular action handling (line 113)
- [ ] Replace `documentStorage.get(documentId)` with `writeCache.getState()` in DELETE_DOCUMENT action handler (line 434)
- [ ] Replace `documentStorage.get(documentId)` with `writeCache.getState()` in UPGRADE_DOCUMENT action handler (line 588)
- [ ] Add `writeCache.putState()` after successful operation application in regular action handling
- [ ] Add `writeCache.putState()` after successful CREATE_DOCUMENT operation
- [ ] Add `writeCache.putState()` after successful UPGRADE_DOCUMENT operation
- [ ] Keep dual-write to legacy `IDocumentStorage` for parity testing (no changes to existing writes)
- [ ] Document transaction boundary limitation: cache update is not atomic with operation store write

#### Testing
- [ ] Create integration test: Reactor + SimpleJobExecutor + KyselyWriteCache
- [ ] Test cache hit path: execute job, verify cached, execute another job on same doc, verify cache used
- [ ] Test cache miss path: clear cache, execute job, verify rebuild from IOperationStore
- [ ] Test warm miss: cache has older revision, execute job, verify incremental rebuild
- [ ] Test keyframe usage: cache cleared, operations exist, verify keyframe acceleration
- [ ] Test cache updates: verify putState called after each successful job
- [ ] Test cache invalidation: multiple scopes/branches maintain separate cache entries
- [ ] Test dual-write parity: verify legacy storage and operation store stay in sync
- [ ] Verify legacy IDocumentStorage still written to (parity requirement)

#### Documentation
- [ ] Document transaction boundary limitation in code comments
- [ ] Add example showing executor initialization with cache
- [ ] Document cache lifecycle: startup before executor.start(), shutdown after executor.stop()
- [ ] Note that Reactor.get() still uses legacy storage (by design for now)

**Acceptance Criteria:**
- Clear integration path documented
- Cache fits into reactor lifecycle
- No breaking changes to existing APIs
- All integration tests pass
- Dual-write parity maintained

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
- [x] Phase 0: IKeyframeStore interface + KyselyKeyframeStore implementation
- [x] Phases 1-6: Core cache implementation with keyframe support
- [x] Phase 7: Warm miss rebuild
- [x] Phase 8: Cache management (invalidate, clear, tests)
- [x] Phase 9 Task 9.1: End-to-end integration tests
- [ ] Phase 9 Tasks 9.2-9.3: Multi-document stress tests, error handling tests
- [ ] Phases 10-12: Test utilities, documentation, performance validation
- [ ] Phase 14: Final integration and validation

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
- **Keyframes**: Persist every Nth revision to IKeyframeStore (database-backed, indexed, O(log n) lookups)
- **Lazy loading**: Don't pre-warm cache on startup, load keyframes on demand
- **Performance**: Database-backed keyframes provide significantly better performance than K/V store iteration

## Success Metrics

1. **Cache hit rate** >80% in job executor scenarios
2. **Keyframe acceleration**: Cold miss rebuild 10x faster with keyframes vs. full rebuild
3. **Operation handling**: Efficiently handles documents with 1000+ operations
4. **Memory usage**: Scales linearly with cache size (ring buffer + LRU)
5. **Keyframe store performance**: O(log n) indexed SQL queries for findNearestKeyframe
6. **Keyframe persistence**: Keyframe persistence adds <5% overhead to putState (async, non-blocking)
7. **Test coverage**: All tests maintain >90% coverage (428 tests passing)
8. **Zero corruption**: No cache corruption or inconsistency bugs
