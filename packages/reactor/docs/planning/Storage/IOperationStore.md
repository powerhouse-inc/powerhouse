# IOperationStore

### Summary

- Read/append-only access to raw operations.
- In the Command Sourcing architecture, this serves as the Command Store that is synchronized between clients.
- No dependencies on `PHDocument` or `Attachment`.
- Optimistic locking: see comparison below.
- All writes are atomic.
- Deterministic hashing.
- Submitting a duplicate operation (same opId, index, and skip) will be rejected with a `DuplicateOperationError`, and reject the entire transaction. Note: The same opId can appear multiple times with different index/skip values to support reshuffle scenarios.
- **Scope-specific**: All operations are stored and queried per `(documentId, scope, branch)` tuple.
- **Cross-scope concerns** like document headers (which aggregate information from multiple scopes) should be handled by `IDocumentView`, not `IOperationStore`.

### Implementations

We will maintain multiple implementations of the `IOperationStore` interface.

- `KyselyOperationStore`: A Kysely implementation. This will be the default implementation, using a PostgreSQL database on the server, PGLite for the browser, and memory for testing and other local development needs.

- `FilesystemOperationStore`: A filesystem implementation. This will be used for local development.

- `IPFSOperationStore`: A IPFS implementation. This will be used for decentralized storage.

- `SwarmOperationStore`: A Swarm implementation. This will be used for decentralized storage.

### Interface

```tsx
class DuplicateOperationError extends Error {
  constructor(opId: string) {
    super(`Operation with opId ${opId} already exists`);
  }
}

interface IOperationStore {
  // this function throws named exceptions when it can't
  // acquire a lock, there are revision mismatches, or
  // the changes cannot be applied atomically
  apply(
    documentId: string,
    documentType: string,
    scope: string,
    branch: string,
    revision: number,
    fn: (txn: AtomicTxn) => Promise<void>,
    signal?: AbortSignal,
  ): Promise<void>;

  // Returns operations for a specific document stream (documentId, scope, branch)
  // Returns Operation[] since context is implicit from the query parameters
  getSince(
    documentId: string,
    scope: string,
    branch: string,
    revision: number,
    paging?: PagingOptions,
    signal?: AbortSignal
  ): Promise<PagedResults<Operation>>;

  // Returns operations across all documents starting from a database ID
  // Returns OperationWithContext[] since context varies per operation
  // Used by IDocumentView to catch up on missed operations during initialization
  getSinceId(
    id: number,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<OperationWithContext>>;

  /**
   * Gets the latest operation index for each scope of a document, along with
   * the latest timestamp across all scopes. This is used to efficiently reconstruct
   * the revision map and lastModified timestamp for document headers.
   *
   * @param documentId - The document id
   * @param branch - The branch name
   * @param signal - Optional abort signal to cancel the request
   * @returns Object containing revision map and latest timestamp
   */
  getRevisions(
    documentId: string,
    branch: string,
    signal?: AbortSignal,
  ): Promise<DocumentRevisions>;
}

type DocumentRevisions {
  /** Map of scope to operation index for that scope */
  revision: Record<string, number>;

  /** Latest timestamp across revisions */
  latestTimestamp: string;
}

interface AtomicTxn {
	// append-only operations
	addOperations(...operations: Operation[]);
}
```

### Usage

```tsx
await operations.apply(documentId, documentType, scope, branch, revision, async (txn) => {
  // get current state to pass to reducers
  const currentState = await readModel.get(documentId, scope, branch, revision);
  const { operations } = await applyReducers(currentState);

  // add new operations
  txn.addOperations(...operations);
});

// Get revision map and latest timestamp efficiently
const { revision, latestTimestamp } = await operations.getRevisions(
  documentId,
  branch
);
// revision = { header: 5, document: 3, global: 10, local: 7 }
// latestTimestamp = "2025-01-15T10:30:00.000Z"

// Get all operations for a document stream with cursor-based paging
// Use getSince with revision 0 to get all operations from the beginning
// First page (cursor starts empty, limit controls page size)
const firstPage = await operations.getSince(
  documentId,
  scope,
  branch,
  0,  // Start from beginning
  { cursor: "", limit: 100 }
);
// firstPage.results = [operation 0, operation 1, ..., operation 99]
// firstPage.nextCursor = "opaque-cursor-string"

// Get next page using cursor
const secondPage = await operations.getSince(
  documentId,
  scope,
  branch,
  0,
  { cursor: firstPage.nextCursor!, limit: 100 }
);

// Or use the convenience function
const secondPageAlt = await firstPage.next!();

// Get operations since a specific revision with paging
const sinceRev50 = await operations.getSince(
  documentId,
  scope,
  branch,
  50,  // Start from revision 50
  { cursor: "", limit: 100 }
);

// Get all operations without paging (omit paging parameter)
const allOperations = await operations.getSince(
  documentId,
  scope,
  branch,
  0  // Start from beginning
);
```

**Note**: Header changes (slug, name, meta) are now handled through regular operations in the "header" scope, not through special transaction methods.

**Note**: The `getRevisions()` method efficiently retrieves the latest operation index for each scope and the overall latest timestamp, which is used by `IDocumentView.getHeader()` to reconstruct document headers without loading all operations.

**Note**: The `getSince()` method supports cursor-based paging using the standard `PagingOptions` and `PagedResults` pattern. The `limit` parameter caps the number of operations returned per page, which is essential for preventing memory exhaustion when dealing with documents that have very large operation histories. This method is primarily used by `IWriteCache` for rebuilding documents on cache misses where operations need to be streamed and applied in pages. The cursor is opaque and implementation-specific, allowing efficient continuation of pagination. Use `getSince(documentId, scope, branch, 0, paging)` to get all operations from the beginning (cold-miss scenario), or `getSince(documentId, scope, branch, cachedRevision, paging)` to get incremental operations (warm-miss scenario).

### DELETE_DOCUMENT Operations

DELETE_DOCUMENT operations are stored in `IOperationStore` like any other operation, maintaining a complete audit trail:

- **Storage**: DELETE_DOCUMENT operations are written to the operation store with a normal operation structure
- **Scope**: DELETE_DOCUMENT operations apply to the `document` scope
- **State Change**: The operation updates `PHDocumentState.document.isDeleted` to `true`, just like other operations update state fields
- **Audit Trail**: Preserves when and why documents were deleted, supporting compliance and recovery
- **Recovery**: Enables "undelete" functionality since the operation is preserved

```tsx
// Example DELETE_DOCUMENT operation in the store
{
  id: 123,
  jobId: "job-uuid",
  opId: "doc-id-delete",
  documentId: "doc-id",
  scope: "document",
  branch: "main",
  index: 5,
  skip: 0,
  timestampUtcMs: "2025-01-15T10:30:00.000Z",
  hash: "abc123...",
  action: {
    type: "DELETE_DOCUMENT",
    input: {
      documentId: "doc-id",
      propagate: "none"
    }
  }
}
```

### Schema

The database schema, in prisma format, will look something like:

```prisma
model Operation {
  // this is the primary key for the operation store, serving as a global sequence number and a pivot
  id              Int          @id @default(autoincrement())

  // id of the job that created the operation
  jobId           String       @unique

  // stable id of the operation, derived from action id
  // not globally unique - same opId can appear with different index/skip during reshuffle
  opId            String

  // serves as a causation id
  prevOpId        String

  // write timestamp of the operation (this is supplied by the db)
  writeTimestampUtcMs DateTime @default(now())

  // defines the stream
  documentId      String
  scope           String
  branch          String

  // defines the signed action (the client does this before submitting the action)
  timestampUtcMs  DateTime
  index           Int
  action          Json

  // defines reshuffling logic (the reactor does this)
  skip            Int

  // compound unique constraint: the index is unique
  @@unique([documentId, scope, branch, index], name: "unique_revision")

  // compound unique constraint: prevents exact duplicate operation instances
  @@unique([opId, index, skip], name: "unique_operation_instance")

  // indexes
  @@index([documentId, scope, branch, id DESC], name: "streamOperations")
  @@index([documentId, scope, id DESC], name: "branchlessStreamOperations")
}
```

#### Indexes

- `streamOperations`: This index lets us find ordered operations by stream. It also lets us quickly find the max index for a stream, which would be the last operation (useful for correct index + skip calculation).
- `branchlessStreamOperations`: This index lets us find all operations for a stream, without a branch.

### Locking

We have two general approaches to locking: optimistic and pessimistic.

Say we use pessimistic locking. In Postgres this would look something like this:

```sql
BEGIN;

-- Lock all operations for the stream
SELECT index, skip
  FROM "Operation"
  WHERE "documentId" = $1 AND "scope" = $2 AND "branch" = $3
FOR UPDATE;
```

Now we calculate the index and skip needed to append a new operation. We might need to reshuffle this operation.

Finally, we append the new operation.

```sql
INSERT INTO "Operation"
  ("documentId", "scope", "branch", "index", "skip", "action", "resultingState", "hash")
VALUES
  ($1, $2, $3, $4, $5, $6, $7, $8);

COMMIT;
```

An optimistic approach would look like this:

```sql
SELECT index, skip
  FROM "Operation"
  WHERE "documentId" = $1 AND "scope" = $2 AND "branch" = $3
  ORDER BY "id" DESC
LIMIT 1;
```

Calculate the next index + skip and submit the operation.

```sql
INSERT INTO "Operation"
  ("documentId", "scope", "branch", "index", "skip", "action", "resultingState", "hash")
VALUES
  ($1, $2, $3, $4, $5, $6, $7, $8);
```

In the case that a write to the same stream was done in the time between read and write, the DB will bounce the write because of the `unique_operation` constraint. However, the only case in which this can happen is if there is a logic error with how the `IQueue` implementation is already queuing actions by stream.

If this same bad logic happened with a pessimistic lock, the second lock would wait on the previous conflicting operation before recalculating and inserting the second operation. This is, surprisingly, a big issue as our initial assumption about how the queue and job execution works is flawed, but the pessimistic lock allows the write anyway.
