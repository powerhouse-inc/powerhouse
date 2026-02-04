# Relationship Operations

### Summary

ADD_RELATIONSHIP and REMOVE_RELATIONSHIP are document-scoped operations that manage directed relationships between source and target documents in the Reactor architecture. These operations maintain an explicit relationship graph separate from document-specific state, enabling relationship queries and traversal without document-model-specific logic.

### Core Design Principle

In the Reactor architecture, relationships are treated as **first-class concerns** while still behaving like any other document operation:

- **Relationships are explicit**: Managed through dedicated operations that live in the same stream as other actions for the source document
- **No extra streams**: We avoid the special system stream; operations are appended to the source document's `document` scope
- **Relationships are separate from document state**: A document's FileNode or folder structure is independent of the relationship graph
- **Relationships enable queries**: IDocumentView and IDocumentIndexer can efficiently query outgoing, incoming, and bidirectional relationship metadata
- **Relationships are event-sourced**: ADD_RELATIONSHIP and REMOVE_RELATIONSHIP are stored in IOperationStore under the source documentId for full audit trail

### Document-Scoped Operations

Relationship operations behave like other reserved operations such as CREATE_DOCUMENT and DELETE_DOCUMENT:

- **Document ID**: The `sourceId` document that owns the relationship
- **Scope**: `"document"` (same scope used for header and lifecycle operations)
- **Branch**: The branch supplied by the caller, typically the source document's branch
- **Processing**: Queued, executed, and stored using the same infrastructure as all document operations

Because these operations run in the source document's queue, they benefit from existing sequencing guarantees without requiring a global system stream.

### Relationship Types

The system supports typed relationships to enable different relationship semantics:

```typescript
type RelationshipType =
  | "child"       // Source-target "child" hierarchy (e.g., drive contains documents)
  | "reference"   // Weak reference (e.g., document links to another)
  | "dependency"  // Strong dependency (e.g., document requires another)
  | string;       // Custom relationship types
```

**Default**: `"child"` is the primary relationship type for document hierarchies.

### ADD_RELATIONSHIP Operation

Establishes a directed relationship from a source document to a target document.

#### Input Schema

```typescript
type AddRelationshipActionInput = {
  sourceId: string;           // Source document ID
  targetId: string;           // Target document ID
  relationshipType: string;   // Type of relationship (default: "child")
  metadata?: Record<string, unknown>; // Optional relationship metadata
};
```

#### Action Structure

```typescript
type AddRelationshipAction = Action & {
  type: "ADD_RELATIONSHIP";
  input: AddRelationshipActionInput;
};
```

#### Behavior

1. **Validation**: The job executor verifies both source and target documents exist and that `sourceId !== targetId`
2. **Idempotency**: Adding the same relationship twice is a no-op (does not create duplicates)
3. **Cross-document integrity**: Attempting to relate to a deleted document is rejected up front, mirroring DELETE_DOCUMENT protections
4. **Read model updates**: IDocumentIndexer updates its relationship index to reflect the new edge once the operation is stored

#### Example

```typescript
await reactor.mutate("drive-123", [
  {
    id: uuidv4(),
    type: "ADD_RELATIONSHIP",
    scope: "document",
    timestampUtcMs: new Date().toISOString(),
    input: {
      sourceId: "drive-123",
      targetId: "document-456",
      relationshipType: "child",
      metadata: {
        addedBy: "user-789",
        position: 0,
      },
    },
  },
]);
```

### REMOVE_RELATIONSHIP Operation

Removes a directed relationship from a source document to a target document.

#### Input Schema

```typescript
type RemoveRelationshipActionInput = {
  sourceId: string;           // Source document ID
  targetId: string;           // Target document ID
  relationshipType: string;   // Type of relationship to remove (default: "child")
};
```

#### Action Structure

```typescript
type RemoveRelationshipAction = Action & {
  type: "REMOVE_RELATIONSHIP";
  input: RemoveRelationshipActionInput;
};
```

#### Behavior

1. **Validation**: The job executor verifies the relationship exists before removing
2. **Idempotency**: Removing a non-existent relationship is a no-op (does not error)
3. **Read model updates**: IDocumentIndexer removes the edge from its relationship graph
4. **Document independence**: Removing a relationship does NOT delete the target document

#### Example

```typescript
await reactor.mutate("drive-123", [
  {
    id: uuidv4(),
    type: "REMOVE_RELATIONSHIP",
    scope: "document",
    timestampUtcMs: new Date().toISOString(),
    input: {
      sourceId: "drive-123",
      targetId: "document-456",
      relationshipType: "child",
    },
  },
]);
```

### IDocumentIndexer Integration

IDocumentIndexer is a read model that builds a graph index of document relationships by listening to the same operation stream as the rest of the system.

#### Indexing Behavior

The document indexer receives `(operation, context)` envelopes from the event bus. For relationship operations the context contains `documentId = sourceId` and `scope = "document"`.

**ADD_RELATIONSHIP Processing:**
1. Extract `sourceId`, `targetId`, and `relationshipType` from the operation input
2. Create or update `DocumentRelationship` record in the graph store
3. Store metadata and timestamp from operation
4. Maintain unique constraint on `(sourceId, targetId, relationshipType)` tuple
5. Update indexes for efficient querying by `sourceId` and `targetId`

**REMOVE_RELATIONSHIP Processing:**
1. Extract `sourceId`, `targetId`, and `relationshipType` from the operation input
2. Delete `DocumentRelationship` record matching the tuple
3. If relationship does not exist, operation is a no-op (idempotent)

#### Querying Relationships

Applications query relationships through IDocumentIndexer interface:

**Available Query Methods:**
- `getOutgoing(documentId, types)` - Get all relationships where the document is the source
- `getIncoming(documentId, types)` - Get all relationships where the document is the target
- `hasRelationship(sourceId, targetId, types)` - Check if relationship exists
- `getDirectedRelationships(sourceId, targetId, types)` - Get specific relationship details
- `findPath(sourceId, targetId, types)` - Find path between two documents
- `findAncestors(documentId, types)` - Get ancestor graph

**Example Usage:**
- Query all targets for a source drive: `getOutgoing(driveId, ["child"])`
- Query all sources for a document: `getIncoming(docId, ["child"])`
- Check if drive contains document: `hasRelationship(driveId, docId, ["child"])`

See [IDocumentIndexer](../Storage/IDocumentIndexer.md) for full interface specification.

### Reactor.addChildren() Implementation

The `addChildren()` method should create ADD_RELATIONSHIP actions and submit them against the source document stream (the public API retains parent/child naming):

**Behavior:**
- Maps each `childId` to an ADD_RELATIONSHIP action
- All actions target the source documentId as provided to `mutate`
- Uses `scope = "document"` and `relationshipType = "child"`
- Returns `JobInfo` from `mutate()` call

**Implementation location:** `packages/reactor/src/core/reactor.ts:474`

### Reactor.removeChildren() Implementation

The `removeChildren()` method should create REMOVE_RELATIONSHIP actions and submit them against the source document stream (the public API retains parent/child naming):

**Behavior:**
- Maps each `childId` to a REMOVE_RELATIONSHIP action
- All actions target the source documentId as provided to `mutate`
- Uses `scope = "document"` and `relationshipType = "child"`
- Returns `JobInfo` from `mutate()` call

**Implementation location:** `packages/reactor/src/core/reactor.ts:545`

### Write Cache Impact

Relationship operations do not use the write cache. Even though they live in the document stream, they follow the same pattern as other imperative lifecycle operations (CREATE_DOCUMENT, DELETE_DOCUMENT, UPGRADE_DOCUMENT).

#### Imperative Handlers Within Document Streams

Unlike regular document operations, relationship operations do NOT:
- Go through document model reducers
- Build up relationship state inside the document snapshot
- Require cached state to be read or written

Instead, the job executor detects these reserved action types and invokes dedicated imperative handlers.

#### ADD_RELATIONSHIP / REMOVE_RELATIONSHIP Processing

When the job executor processes these operations:

1. **Detection**: Executor detects action type in the job
2. **Handler invocation**: Calls dedicated handler method (not a reducer)
3. **Direct update**: Handler updates IDocumentIndexer (or emits event for it) to mutate the relationship graph
4. **Audit trail**: Operation stored in IOperationStore at `(sourceId, "document", branch)`
5. **Event emission**: Event bus notifies read models of the new operation

**No cache involvement:**
- No call to `writeCache.getState()` to load previous relationship state
- No call to `writeCache.putState()` to store resulting state
- Relationship graph is maintained directly by IDocumentIndexer

#### Individual Document Caches Unaffected

Adding or removing relationships does NOT invalidate document caches:
- Document state (global, local, document scopes) is independent of relationship graph
- Documents continue using cached state normally
- No coordination needed between relationship operations and document caches

### Operation Index Impact

The IOperationIndex is written to synchronously during job execution (not asynchronously as a read model). When the job executor processes relationship operations, it updates both IOperationStore and IOperationIndex.

#### Collection Updates During Job Execution

When the job executor processes ADD_RELATIONSHIP with `relationshipType = "child"`:
1. **Extract collection ID** from the source document
   - If the source is a drive: `collectionId = "drive.${sourceId}"`
2. **Add child to collection** in `document_collections` table:
   ```sql
   INSERT INTO document_collections (documentId, collectionId)
   VALUES (childId, collectionId)
   ON CONFLICT DO NOTHING;
   ```
3. **Index operation** in `operation_index_operations` table with `documentId = sourceId`

When the job executor processes REMOVE_RELATIONSHIP:
1. **Child remains in collection**
   - Collections are cumulative (documents that have EVER been in a drive)
   - Removal does not delete from `document_collections`
2. **Operation still indexed** so listeners can react to relationship changes

#### Listener Impact

Listeners filtering on `driveId` receive document-stream operations affecting that drive's collection:
- ADD_RELATIONSHIP operations notify listeners of new children
- REMOVE_RELATIONSHIP operations notify listeners of removed children
- Listeners can maintain their own relationship state or query IDocumentIndexer

#### Performance Considerations

Relationship operations are relatively infrequent compared to document operations:
- Adding a child: 1 relationship operation + 1 collection insert
- Removing a child: 1 relationship operation (no collection delete)
- No document cache invalidation overhead
- Operation index updates are append-only (fast)

### Relationship vs Document State

It is critical to understand the separation between relationships and document state:

| Concern | Relationship Operations | Document State (e.g., FileNode) |
|---------|------------------------|--------------------------------|
| **What** | Graph edges between documents | Document-specific metadata |
| **Where** | Stored in source document stream, indexed by IDocumentIndexer | Stored inside document scope state |
| **Purpose** | Enable queries, traversal, relationship metadata | Store file/folder structure, names, types |
| **Example** | `ADD_RELATIONSHIP(drive-123, doc-456, "child")` | `ADD_FILE({ id: "doc-456", name: "Report.txt", parentFolder: "folder-1" })` |
| **Query** | `getOutgoing(driveId)` returns `childIds` | `driveDoc.state.global.nodes` contains FileNode |

**Key Point**: A drive's FileNode array is independent of the relationship graph. ADD_FILE adds a FileNode; ADD_RELATIONSHIP creates a queryable source-target edge of type "child".

### Document Deletion and Relationships

When a document is deleted:

1. **Document state is marked deleted** (via DELETE_DOCUMENT in document scope)
2. **Relationships remain** (relationship operations are independent)
3. **Query behavior changes**:
   - `getChildren(deletedDocId)` returns relationships (unchanged)
   - `get(childId)` throws `DocumentDeletedError` if child is deleted
   - Client code must handle deletion separately

**Future**: Cascade deletion can be implemented via:

```typescript
deleteDocument({
  documentId: "source-123",
  propagate: "cascade"
})
```

This would create both DELETE_DOCUMENT and REMOVE_RELATIONSHIP operations in a single transaction, all within the source document stream.

### Edge Cases

1. **Circular relationships**:
   - System allows circular relationships (e.g., A ↔ B ↔ A)
   - Document models are responsible for preventing invalid hierarchies
   - Relationship queries must guard against infinite loops

2. **Multiple relationship types**:
   - Same source/target pair can have different relationship types
   - Example: Document A can be both "child" and "reference" of Document B
   - Queries filter by `relationshipType`

3. **Orphaned relationships**:
   - Deleting a document does NOT remove its relationships
   - `getChildren(deletedDocId)` still returns child IDs
   - Client code handles deleted document errors when traversing

4. **Concurrent relationship operations**:
   - Per-document queues serialize ADD/REMOVE operations for a given source
   - No race conditions between ADD and REMOVE for the same source document
   - Idempotency ensures consistent state when operations replay

### Storage Impact

Relationship edges are indexed exclusively by `IDocumentIndexer`. IDocumentView continues to focus on document snapshots and headers, delegating any relationship lookups to the indexer. Consumers that need relationship data should call the indexer API rather than expecting the document snapshot schema to grow new tables.

### Links

- [Operations Index](mdc:index.md)
- [DELETE_DOCUMENT](mdc:delete.md)
- [IDocumentView](mdc:../Storage/IDocumentView.md)
- [IOperationStore](mdc:../Storage/IOperationStore.md)
