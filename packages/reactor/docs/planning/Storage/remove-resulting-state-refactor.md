# Remove resultingState from IOperationStore - Implementation Plan

## Overview

Refactor IOperationStore to be a pure command store by NOT persisting the `resultingState` field in the database. The `resultingState` will be computed by the job executor and passed ephemerally to IDocumentView via `OperationContext` during event-based indexing, but not stored in the operation store.

**Important**: The `Operation` TypeScript type keeps the optional `resultingState` field for backward compatibility with legacy systems. We're only changing storage behavior, not the type definition.

## Goals

1. Make IOperationStore a true append-only command store (don't persist resultingState)
2. Pass `resultingState` to IDocumentView via OperationContext during indexing (ephemeral)
3. **IDocumentView always receives resultingState** - it never rebuilds documents
4. **IWriteCache rebuilds documents** - only component that uses reducers to rebuild from operations
5. **Maintain backward compatibility**: Keep `resultingState` on Operation type (for legacy systems)

## Architectural Decision

**Key Change**: `resultingState` is NOT persisted in IOperationStore, but passed via `OperationContext` during events.

- **Operation type**: UNCHANGED - keeps optional `resultingState` field for legacy compatibility
- **IOperationStore**: Does NOT persist `resultingState` to database
- **OperationContext**: Includes ephemeral `resultingState` for event-based communication
- **Benefits**: Smaller storage, true command store, validates reducer determinism

**Important**: The `Operation` TypeScript type from `document-model` package remains unchanged with `resultingState?: string` for backward compatibility with legacy systems. We're only changing storage and event patterns.

## Current Architecture

```
JobExecutor
  ├─> Computes resultingState
  ├─> Stores operation WITH resultingState in IOperationStore
  └─> Emits event to IDocumentView

IDocumentView
  └─> Reads operations from IOperationStore (includes resultingState)
      └─> Uses resultingState directly (no reducer execution)
```

## Target Architecture

```
JobExecutor
  ├─> Computes resultingState temporarily
  ├─> Stores operation WITHOUT resultingState in IOperationStore
  └─> Emits event with resultingState IN CONTEXT (ephemeral)

IDocumentView (Read-Side Projection)
  └─> ALWAYS receives resultingState from context during indexing
      └─> Uses resultingState to build snapshot
      └─> Doesn't persist resultingState
      └─> NEVER rebuilds from operations

IWriteCache (Write-Side Projection, future)
  └─> Reads operations from IOperationStore (no resultingState)
      └─> Rebuilds documents using reducers from IDocumentModelRegistry
      └─> ONLY component that rebuilds from operations
```

## Phase 1: Update Types and Interfaces

### Task 1.1: Update database schema types (NOT Operation type)
- [ ] Remove `resultingState` field from `OperationTable` in `src/storage/kysely/types.ts`
- [ ] Keep `error` field (still needed for failed operations)
- [ ] Update `OperationRow`, `InsertableOperation`, `UpdateableOperation` types
- [ ] **IMPORTANT**: Do NOT modify the `Operation` type from `document-model` package

**Files:**
- `packages/reactor/src/storage/kysely/types.ts` (database schema types)

**NOT changed:**
- `document-model` package `Operation` type (keeps `resultingState` for legacy)

**Acceptance Criteria:**
- Database schema types no longer include resultingState
- `Operation` type from document-model remains unchanged
- Compilation succeeds with type changes

### Task 1.2: Add resultingState to OperationContext
- [ ] Update `OperationContext` type in `src/storage/interfaces.ts`
- [ ] Add optional `resultingState?: string` field
- [ ] This is used for event bus communication only (ephemeral)
- [ ] Update JSDoc to clarify this field is not persisted

**Definition:**
```typescript
export type OperationContext = {
  documentId: string;
  documentType: string;
  scope: string;
  branch: string;
  resultingState?: string; // Ephemeral, passed via events only
};

export type OperationWithContext = {
  operation: Operation; // Clean Operation type (no resultingState)
  context: OperationContext; // Context includes ephemeral resultingState
};
```

**Acceptance Criteria:**
- OperationContext has optional resultingState field
- Operation type stays clean (no resultingState)
- JSDoc clarifies resultingState is ephemeral

### Task 1.3: Update IDocumentView interface
- [ ] Update `indexOperations` signature in `src/storage/interfaces.ts`
- [ ] Accept `OperationWithContext[]` where context may include `resultingState`
- [ ] Document that resultingState is ephemeral (not persisted)
- [ ] Update JSDoc to clarify this is for optimization only

**Signature:**
```typescript
interface IDocumentView {
  /**
   * Indexes a list of operations.
   *
   * @param items - Operations with context. Context may include ephemeral
   *                resultingState for optimization (not persisted).
   */
  indexOperations(items: OperationWithContext[]): Promise<void>;

  // ... other methods unchanged
}
```

**Acceptance Criteria:**
- Interface accepts OperationWithContext (context may have resultingState)
- JSDoc clarifies resultingState is ephemeral optimization
- No breaking changes to other methods
- Operation type stays clean

## Phase 2: Update Operation Store

### Task 2.1: Remove resultingState from schema migration
- [ ] Update table creation in `KyselyOperationStore` (or separate migration)
- [ ] Remove `resultingState` column from Operation table
- [ ] Keep this change separate for easy rollback

**In `src/storage/kysely/store.ts` or in factories:**
```typescript
// Remove this line from table creation:
// .addColumn("resultingState", "text")
```

**Acceptance Criteria:**
- New databases don't create resultingState column
- Existing tests with fresh DBs work

### Task 2.2: Update AtomicTransaction
- [ ] Update `AtomicTransaction.addOperations()` in `src/storage/txn.ts`
- [ ] Remove setting `resultingState` field
- [ ] Keep `error` field handling

**Changes in `src/storage/txn.ts`:**
```typescript
addOperations(...operations: Operation[]): void {
  for (const op of operations) {
    this.operations.push({
      jobId: uuidv4(),
      opId: op.id || uuidv4(),
      prevOpId: "",
      documentId: this.documentId,
      documentType: this.documentType,
      scope: this.scope,
      branch: this.branch,
      timestampUtcMs: new Date(op.timestampUtcMs),
      index: op.index,
      action: JSON.stringify(op.action),
      skip: op.skip,
      // resultingState: removed
      error: op.error || null,
      hash: op.hash,
    });
  }
}
```

**Acceptance Criteria:**
- AtomicTransaction no longer includes resultingState
- Tests compile with updated types

### Task 2.3: Update KyselyOperationStore read methods
- [ ] Update `rowToOperation()` to not include resultingState
- [ ] Ensure `getSince()` returns operations without resultingState
- [ ] Ensure `getSinceId()` returns operations without resultingState

**Changes in `src/storage/kysely/store.ts`:**
```typescript
private rowToOperation(row: OperationRow): Operation {
  return {
    index: row.index,
    timestampUtcMs: row.timestampUtcMs.toISOString(),
    hash: row.hash,
    skip: row.skip,
    error: row.error || undefined,
    // resultingState: removed
    id: row.opId,
    action: JSON.parse(row.action) as Operation["action"],
  };
}
```

**Acceptance Criteria:**
- Operations returned from store don't have resultingState
- Read methods compile successfully

## Phase 3: Update Job Executor

### Task 3.1: Track resultingState separately in executor
- [ ] Update `SimpleJobExecutor` to track resultingState in separate map
- [ ] Keep operations and resultingState paired during execution
- [ ] Don't populate resultingState field on Operation objects (leave undefined)

**In `src/executor/simple-job-executor.ts`:**
```typescript
async executeJob(job: Job): Promise<JobResult> {
  const generatedOperations: Operation[] = [];
  const resultingStates: Map<string, string> = new Map(); // opId -> resultingState

  // ... process actions ...

  // Create operation WITHOUT populating resultingState
  const operation: Operation = {
    index: nextIndex,
    hash: calculatedHash,
    skip: 0,
    id: opId,
    action: action,
    timestampUtcMs: new Date().toISOString(),
    // resultingState field exists on type but we don't populate it
  };

  generatedOperations.push(operation);
  resultingStates.set(opId, JSON.stringify(currentState));

  // Later: emit to document view with resultingState in context
}
```

**Acceptance Criteria:**
- Executor tracks resultingState separately
- Operations don't have resultingState populated (undefined)
- Operation type unchanged (field exists but unused)
- Pairing maintained for event emission

### Task 3.2: Update event emission to include resultingState in context
- [ ] Modify event emission to attach resultingState to context
- [ ] Use `OperationContext` with ephemeral `resultingState` field
- [ ] Emit to IDocumentView with ephemeral resultingState in context
- [ ] Keep Operation type clean (no resultingState on operation)

**Event emission:**
```typescript
// Emit operations with ephemeral resultingState in context
for (const operation of generatedOperations) {
  await this.eventBus.emit(OperationEventTypes.OPERATION_CREATED, {
    operation: operation, // Clean Operation type
    context: {
      documentId: job.documentId,
      documentType: documentType,
      scope: job.scope,
      branch: job.branch,
      resultingState: resultingStates.get(operation.id!), // Ephemeral, in context
    },
  });
}
```

**Acceptance Criteria:**
- Events include resultingState in context (not on operation)
- Operation type stays clean
- resultingState not persisted to operation store
- Document view receives resultingState via context

## Phase 4: Update Document View

### Task 4.1: Update KyselyDocumentView to use ephemeral resultingState from context
- [ ] Update `indexOperations()` to accept `OperationWithContext[]`
- [ ] Access `resultingState` from `context` (not operation)
- [ ] **REQUIRE** resultingState - throw error if missing
- [ ] IDocumentView NEVER rebuilds from operations (IWriteCache does that)

**In `src/read-models/document-view.ts`:**
```typescript
async indexOperations(items: OperationWithContext[]): Promise<void> {
  if (items.length === 0) return;

  await this.db.transaction().execute(async (trx) => {
    for (const item of items) {
      const { operation, context } = item;
      const { documentId, scope, branch, documentType, resultingState } = context;
      const { index, hash } = operation;

      // REQUIRE resultingState from context - IDocumentView never rebuilds
      if (!resultingState) {
        throw new Error(
          `Missing resultingState in context for operation ${operation.id}. ` +
          `IDocumentView requires resultingState from upstream - it does not rebuild documents.`
        );
      }

      // Use ephemeral resultingState from context
      let fullState: Record<string, unknown> = {};
      try {
        fullState = JSON.parse(resultingState) as Record<string, unknown>;
      } catch (error) {
        throw new Error(
          `Failed to parse resultingState for operation ${operation.id}: ${error}`
        );
      }

      // ... rest of indexing logic unchanged ...
    }
  });
}
```

**Acceptance Criteria:**
- Document view REQUIRES resultingState from context
- Throws clear error if resultingState missing
- Operation type stays clean (no resultingState)
- IDocumentView never rebuilds from operations

### Task 4.2: Remove any existing fallback logic
- [ ] Check if KyselyDocumentView has any fallback/rebuild logic
- [ ] Remove any code that attempts to rebuild from operations
- [ ] Ensure IDocumentView strictly requires resultingState
- [ ] Update comments to clarify IDocumentView never rebuilds

**Acceptance Criteria:**
- No fallback logic in IDocumentView
- Clear that IDocumentView requires resultingState from upstream
- IWriteCache (future) will be the only component that rebuilds

## Phase 5: Update Tests

### Task 5.1: Update storage tests
- [ ] Update `test/storage/kysely.test.ts`
- [ ] Remove expectations of resultingState in persisted operations
- [ ] Verify operations returned from getSince() don't have resultingState populated
- [ ] Test that operations can be stored without resultingState populated

**Test updates:**
```typescript
describe("KyselyOperationStore", () => {
  it("should not persist resultingState", async () => {
    const opWithResultingState: Operation = {
      index: 0,
      id: generateId(),
      hash: "hash-1",
      skip: 0,
      timestampUtcMs: new Date().toISOString(),
      action: someAction,
      resultingState: "this should not be persisted", // Populated but not persisted
    };

    await store.apply(documentId, documentType, scope, branch, 0, (txn) => {
      txn.addOperations(opWithResultingState);
    });

    const result = await store.getSince(documentId, scope, branch, -1);
    // resultingState exists on type but should be undefined after storage
    expect(result.items[0].resultingState).toBeUndefined();
  });
});
```

**Acceptance Criteria:**
- All storage tests pass
- Tests verify resultingState not persisted (undefined after retrieval)
- Tests updated to new schema
- Operation type unchanged (field exists)

### Task 5.2: Update executor tests
- [ ] Update `test/executor/simple-job-executor.test.ts`
- [ ] Update `test/executor/executor-integration.test.ts`
- [ ] Verify operations emitted to event bus include resultingState in context
- [ ] Verify operations stored don't include resultingState
- [ ] Verify operation type stays clean

**Test pattern:**
```typescript
it("should emit operations with ephemeral resultingState in context", async () => {
  const emittedEvents: any[] = [];
  eventBus.on(OperationEventTypes.OPERATION_CREATED, (data) => {
    emittedEvents.push(data);
  });

  await executor.executeJob(job);

  // resultingState in context (ephemeral)
  expect(emittedEvents[0].context).toHaveProperty("resultingState");
  expect(emittedEvents[0].context.resultingState).toBeDefined();

  // resultingState not populated on operation
  expect(emittedEvents[0].operation.resultingState).toBeUndefined();

  // Storage doesn't persist it
  const stored = await operationStore.getSince(docId, scope, branch, -1);
  expect(stored.items[0].resultingState).toBeUndefined();
});
```

**Acceptance Criteria:**
- Executor tests pass
- Events verified to include ephemeral resultingState in context
- Operations stay clean (no resultingState)
- Storage verified to exclude resultingState

### Task 5.3: Update document-view tests
- [ ] Update `test/read-models/document-view.test.ts`
- [ ] Pass resultingState in context (not on operation)
- [ ] Verify snapshots created correctly
- [ ] Test ephemeral resultingState handling

**Test updates:**
```typescript
it("should index operations with ephemeral resultingState in context", async () => {
  await documentView.indexOperations([{
    operation: operation, // Clean operation (no resultingState)
    context: {
      documentId,
      documentType,
      scope,
      branch,
      resultingState: JSON.stringify(documentState), // In context
    },
  }]);

  // Verify snapshot created
  const doc = await documentView.get(documentId);
  expect(doc).toBeDefined();
});
```

**Acceptance Criteria:**
- Document view tests pass
- Tests pass resultingState in context
- Operations stay clean (no resultingState)
- Snapshots built correctly from ephemeral state

### Task 5.4: Update integration tests
- [ ] Update `test/integration/*.test.ts`
- [ ] Verify end-to-end flow works
- [ ] Verify event bus passes resultingState correctly
- [ ] Verify storage doesn't persist resultingState

**Acceptance Criteria:**
- All integration tests pass
- Full flow tested (executor -> event -> document view)
- No resultingState in storage confirmed

## Phase 6: Migration and Cleanup

### Task 6.1: Create data migration (optional)
- [ ] Create migration script if needed for existing data
- [ ] Drop `resultingState` column from existing databases
- [ ] Document migration process

**Migration SQL:**
```sql
-- For PGLite/PostgreSQL
ALTER TABLE "Operation" DROP COLUMN IF EXISTS "resultingState";
```

**Acceptance Criteria:**
- Migration script created
- Tested on sample database
- Documented in migration guide

### Task 6.2: Update documentation
- [ ] Update IOperationStore.md to reflect no resultingState
- [ ] Update architecture diagrams
- [ ] Document that resultingState is ephemeral
- [ ] Update write-cache spec to clarify rebuild from operations

**Files to update:**
- `docs/planning/Storage/IOperationStore.md`
- `docs/planning/Cache/write-cache.md`
- `docs/planning/Cache/index.md`

**Acceptance Criteria:**
- Docs accurately reflect new architecture
- Clear explanation of ephemeral resultingState
- Examples updated

### Task 6.3: Final validation
- [ ] Run full test suite: `pnpm test`
- [ ] Run type checking: `pnpm tsc --build`
- [ ] Run linter: `pnpm lint`
- [ ] Verify all tests pass
- [ ] Verify no TypeScript errors

**Acceptance Criteria:**
- All tests pass
- No compilation errors
- No linting errors
- Code follows CLAUDE.md conventions

## Phase 7: Prepare for IWriteCache

### Task 7.1: Document rebuild requirements and responsibility split
- [ ] Document that **IWriteCache is the ONLY component that rebuilds** from operations
- [ ] Document that **IDocumentView NEVER rebuilds** - always receives resultingState from upstream
- [ ] Create shared rebuild utilities for IWriteCache (if beneficial)

**Responsibility Split:**
```
┌─────────────────────────────────────────────────────┐
│              Job Executor                           │
│  - Computes resultingState                          │
│  - Passes to IDocumentView via events (ephemeral)   │
└─────────────────────────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        │                       │
        v                       v
┌───────────────┐      ┌────────────────┐
│ IDocumentView │      │  IWriteCache   │
│ (Read-Side)   │      │  (Write-Side)  │
│               │      │                │
│ ALWAYS gets   │      │ ALWAYS         │
│ resultingState│      │ rebuilds from  │
│ from upstream │      │ operations     │
│               │      │ using reducers │
│ NEVER rebuilds│      │                │
└───────────────┘      └────────────────┘
```

**Future considerations:**
```typescript
// Rebuild utility for IWriteCache ONLY
export function rebuildDocumentFromOperations(
  operations: Operation[],
  reducer: Reducer,
  documentId: string,
  documentType: string,
): PHDocument {
  // Used ONLY by IWriteCache
  // IDocumentView does NOT use this
}
```

**Acceptance Criteria:**
- Clear documentation of rebuild responsibilities
- IWriteCache documented as ONLY component that rebuilds
- IDocumentView documented as NEVER rebuilding
- Path forward for IWriteCache documented

## Rollback Plan

If issues arise:
1. Revert schema changes (keep resultingState column)
2. Revert AtomicTransaction changes
3. Revert event emission changes
4. Revert type changes
5. All changes are isolated to specific files for easy reversion

## Testing Strategy

1. **Unit tests**: Test each component in isolation
2. **Integration tests**: Test full flow (executor -> storage -> document view)
3. **Manual testing**: Test with real document-drive operations
4. **Performance testing**: Ensure no performance regression

## Dependencies

- None (this is a prerequisite refactor for IWriteCache)

## Estimated Complexity

- **Low risk**: Changes are well-isolated
- **Medium complexity**: Touches multiple components
- **High value**: Enables proper IWriteCache architecture

## Success Criteria

- [ ] IOperationStore doesn't persist resultingState
- [ ] Operations stored are pure commands
- [ ] IDocumentView receives ephemeral resultingState via events
- [ ] All tests pass
- [ ] No TypeScript errors
- [ ] Documentation updated
- [ ] Ready for IWriteCache implementation
