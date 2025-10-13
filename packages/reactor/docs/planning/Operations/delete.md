# DELETE_DOCUMENT Operation

### Summary

The DELETE_DOCUMENT operation implements soft deletion in the Reactor's command-sourcing architecture. Rather than physically removing documents, deletion is treated as a state transition that preserves the complete audit trail while preventing further operations on deleted documents.

### Core Design Principle

In a command-sourcing architecture, deletion is a **state transition**, not physical removal:

- **DELETE_DOCUMENT operations** are stored in `IOperationStore` like any other operation (maintains complete audit trail)
- **Document state** is marked as deleted via `isDeleted = true` in `IDocumentView` (enables soft delete semantics)
- **Query behavior** is consistent and explicit across all methods (clear user expectations)

### DELETE_DOCUMENT as Document State Change

DELETE_DOCUMENT is treated as a **state change in the document scope**, not a global system operation:

- **Scope**: DELETE_DOCUMENT operations are stored in the **"document" scope**
- **State Update**: Deletion updates the `PHDocumentState.document` object with deletion metadata
- **Read Model Simplicity**: IDocumentView indexes DELETE operations like any other operation - no special logic needed

This approach makes deletion consistent with other document operations and simplifies read model implementation.

### Document State Structure

Deletion metadata is stored in the document's state:

```typescript
type PHDocumentState = {
  // ... other document scope fields
  isDeleted?: boolean;
  deletedAtUtcIso?: string;      // ISO timestamp
  deletedBy?: string;             // Optional: who deleted it
  deletionReason?: string;        // Optional: why it was deleted
}
```

The DELETE_DOCUMENT operation updates this state in the document scope, just like any other operation.

### Query Behavior with Deleted Documents

| Method | Deleted Document Behavior | Return Value |
|--------|---------------------------|--------------|
| `exists([id])` | Treated as non-existent | `[false]` |
| `get(id)` | Throws error | `DocumentDeletedError` with metadata |
| `getBySlug(slug)` | Throws error | `DocumentDeletedError` with metadata |
| `getMany([ids])` | Skipped in results | `[null]` for deleted docs |
| `getHeader(id)` | Throws error | `DocumentDeletedError` with metadata |
| `find({ ...filter })` | Excluded by default | Empty/partial results |
| `find({ ...filter, includeDeleted: true })` | Included with flag | Full results |

### Operation Ordering and Reshuffling

**Key Principle**: By the time operations reach read models (IDocumentView), they have already been:
- Verified by the job executor
- Reshuffled based on timestamps (not indices)
- Assigned final index and skip values
- Stored in IOperationStore in append-only form

#### Write-Side Reshuffling and Validation

The write side (IJobExecutor + IOperationStore) enforces deletion boundaries during job execution. Operations that would violate deletion semantics are rejected before being stored.

**Reshuffling is timestamp-based, not index-based**, following the general reshuffling rules documented in [Jobs/reshuffle.md](../Jobs/reshuffle.md).

Example operation stream after write-side reshuffling:

```typescript
[
  { index: 0, skip: 0, type: "CREATE_DOCUMENT" },
  { index: 1, skip: 0, type: "UPDATE_FIELD" },
  { index: 2, skip: 1, type: "UPDATE_FIELD" },   // Reshuffled earlier (skip=1)
  { index: 3, skip: 0, type: "UPDATE_FIELD" },   // Reshuffled from later
  { index: 4, skip: 0, type: "DELETE_DOCUMENT" }, // Deletion
  // Operations after this point would have been rejected at write time
]
```

**Note**: Operations arrive at read models with final `index` and `skip` values already calculated. Read models don't recalculate these.

#### Write Model Behavior (IJobExecutor)

The job executor enforces deletion boundaries **before** operations are stored:

1. **Check document state before reshuffling**:
   - Load current document from storage
   - Check `document.state.document.isDeleted` flag
   - If deleted, reject any new operations (they can't be reshuffled into a deleted document's history)

2. **Timestamp-based reshuffling** (not index-based):
   - Operations are ordered by `timestampUtcMs`
   - Reshuffling assigns final `index` and `skip` values based on timestamp order
   - DELETE_DOCUMENT establishes a timestamp boundary beyond which no operations can be inserted

#### Read Model Behavior (IDocumentView)

Read models are **much simpler** - they just index operations as they arrive:

```typescript
async indexOperations(items: OperationWithContext[]): Promise<void> {
  // Operations arrive pre-validated and pre-reshuffled from write side
  // Just index them in order

  await this.db.transaction().execute(async (trx) => {
    for (const item of items) {
      const { operation, context } = item;
      const { documentId, scope, branch } = context;

      // Reconstruct document state by applying this operation
      const currentSnapshot = await this.getSnapshot(documentId, scope, branch);
      const updatedState = applyOperation(currentSnapshot, operation);

      // If this is a DELETE_DOCUMENT operation, the state will now include deletion info
      const isDeleted = updatedState.document?.isDeleted || false;
      const deletedAtUtcIso = updatedState.document?.deletedAtUtcIso || null;

      // Update or create snapshot with new state
      await this.upsertSnapshot({
        documentId,
        scope,
        branch,
        content: updatedState,
        isDeleted,         // Comes from document state
        deletedAtUtcIso,   // Comes from document state
        lastOperationIndex: operation.index,
        lastOperationHash: operation.hash,
      });
    }
  });
}
```

**Key Points**:
- No deletion boundary checking (already done on write side)
- No skipping of operations (invalid operations never reach read model)
- Just apply operations to update document state
- Deletion status comes from the document state itself, not separate tracking

#### Operation Store Behavior (IOperationStore)

The operation store only stores operations that have passed write-side validation:

- **Only valid operations are stored**: Operations that violate deletion semantics are rejected by IJobExecutor before reaching IOperationStore
- **No validation logic**: IOperationStore doesn't check deletion semantics - it trusts the executor
- **Append-only**: All stored operations have final index/skip values from reshuffling

**Rationale**: Separation of concerns - IJobExecutor validates and reshuffles, IOperationStore persists final results.

### Edge Cases

1. **Multiple DELETE_DOCUMENT operations**:
   - First DELETE_DOCUMENT sets `isDeleted = true` in document state
   - Deletion attempts after deletion boundary are rejected, just like any other operation

2. **DELETE_DOCUMENT on non-existent document**:
   - Job executor checks if document exists before processing DELETE
   - If document doesn't exist, operation fails with clear error
   - No operation is stored (nothing to delete)

3. **Concurrent operations with DELETE**:
   - All operations flow through the queue system
   - Queue ensures operations are processed per `(documentId, scope, branch)`
   - Timestamp-based reshuffling determines final order
   - Operations timestamped after deletion are rejected

4. **Rebuilding from operations**:
   - When replaying operations (e.g., after cache invalidation), process in order by index
   - Apply each operation to update document state
   - DELETE_DOCUMENT operation updates state to set `isDeleted = true`
   - Read model snapshots reflect final state after all operations applied

### Schema Changes

`DocumentSnapshot` schema derives deletion status from document state:

```typescript
interface DocumentSnapshotTable {
  // ... existing fields

  // Soft delete fields derived from document state
  isDeleted: boolean;                    // From document.state.document.isDeleted
  deletedAtUtcIso: string | null;       // From document.state.document.deletedAtUtcIso
}
```

The `isDeleted` and `deletedAtUtcIso` fields are **derived from the document's own state**, not tracked separately.

### Links

* [Operations Index](mdc:index.md)
* [Jobs Reshuffle](mdc:../Jobs/reshuffle.md)
* [PHDocument](mdc:../PHDocument/index.md)
* [IOperationStore](mdc:../Storage/IOperationStore.md)
* [IDocumentView](mdc:../Storage/IDocumentView.md)
