# IWriteCache Schema

### Summary

The write cache maintains three primary tables: one for mapping documents to collections, one for storing operations in ordinal order, and one for tracking cursor position. The schema is optimized for efficient querying by collection, document type, branch, and scope.

### Tables

#### document_collections

Maps documents to their collections. A collection is the set of all documents _that have ever been_ in a drive. Multiple documents can belong to the same collection, and a document can belong to multiple collections.

```sql
CREATE TABLE document_collections (
  documentId TEXT NOT NULL,
  collectionId TEXT NOT NULL,
  PRIMARY KEY (documentId, collectionId)
);

CREATE INDEX idx_doc_collections_collection ON document_collections(collectionId);
```

**Columns:**

- `documentId` - The document identifier
- `collectionId` - The collection identifier (format: `drive.{driveId}`)

#### write_cache_operations

Stores operations in ordinal order. Unlike IOperationStore, this table is not append-only and can be garbage collected. Operations are stored with denormalized document metadata for efficient querying.

```sql
CREATE TABLE write_cache_operations (
  ordinal BIGSERIAL PRIMARY KEY,
  opId TEXT NOT NULL UNIQUE,
  documentId TEXT NOT NULL,
  documentType TEXT NOT NULL,
  scope TEXT NOT NULL,
  branch TEXT NOT NULL,
  timestampUtcMs BIGINT NOT NULL,
  index INTEGER NOT NULL,
  action JSONB NOT NULL
);

CREATE INDEX idx_wc_ops_doc ON write_cache_operations(documentId);
CREATE INDEX idx_wc_ops_type ON write_cache_operations(documentType);
CREATE INDEX idx_wc_ops_branch ON write_cache_operations(branch);
CREATE INDEX idx_wc_ops_scope ON write_cache_operations(scope);
```

**Columns:**

- `ordinal` - Sequential number for ordering operations (auto-increment)
- `opId` - Unique operation identifier
- `documentId` - The document this operation belongs to
- `documentType` - Type of the document (denormalized for query performance)
- `scope` - Operation scope
- `branch` - Branch name
- `timestampUtcMs` - UTC timestamp in milliseconds when the operation was created
- `index` - Operation index within the document's operation stream
- `action` - The operation action data as JSON

#### write_cache_metadata

Tracks the cursor position, representing the highest ordinal from IOperationStore that has been processed and written to the cache.

```sql
CREATE TABLE write_cache_metadata (
  key TEXT PRIMARY KEY,
  value BIGINT NOT NULL
);
```

**Columns:**

- `key` - Metadata key (e.g., `cursor`)
- `value` - Metadata value (e.g., ordinal position)

### Query Example

Query all operations for a collection with filters:

```sql
SELECT
    wc.ordinal,
    wc.opId,
    wc.documentId,
    wc.documentType,
    wc.scope,
    wc.branch,
    wc.timestampUtcMs,
    wc.index,
    wc.action
FROM write_cache_operations wc
JOIN document_collections dc ON wc.documentId = dc.documentId
WHERE 1=1
    AND dc.collectionId IN ('drive.drive1', 'drive.drive2')
    AND wc.documentType IN ('documentType1', 'documentType2')
    AND wc.branch IN ('branch1', 'branch2')
    AND wc.scope IN ('scope1', 'scope2')
    AND wc.ordinal > $1  -- cursor position
ORDER BY wc.ordinal
LIMIT $2;
```

### Notes

- The `ordinal` field provides a simple, monotonically increasing cursor mechanism
- The `opId` unique constraint prevents duplicate operations
- JSONB is used for the `action` field to enable future JSON querying if needed
- When no drive filter is provided, the join with `document_collections` can be skipped
