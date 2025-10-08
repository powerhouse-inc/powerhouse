# IOperationIndex Schema

### Summary

The operation index maintains three primary tables: one for mapping documents to collections, one for storing operations in ordinal order, and one for tracking cursor position. The schema is optimized for efficient querying by collection, document type, branch, and scope.

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

#### operation_index_operations

Stores operations in ordinal order. Unlike IOperationStore, this table is not append-only and can be garbage collected. Operations are stored with denormalized document metadata for efficient querying.

```sql
CREATE TABLE operation_index_operations (
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

CREATE INDEX idx_oi_ops_doc ON operation_index_operations(documentId);
CREATE INDEX idx_oi_ops_type ON operation_index_operations(documentType);
CREATE INDEX idx_oi_ops_branch ON operation_index_operations(branch);
CREATE INDEX idx_oi_ops_scope ON operation_index_operations(scope);
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

#### operation_index_metadata

Tracks the cursor position, representing the highest ordinal from IOperationStore that has been processed and written to the index.

```sql
CREATE TABLE operation_index_metadata (
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
    oi.ordinal,
    oi.opId,
    oi.documentId,
    oi.documentType,
    oi.scope,
    oi.branch,
    oi.timestampUtcMs,
    oi.index,
    oi.action
FROM operation_index_operations oi
JOIN document_collections dc ON oi.documentId = dc.documentId
WHERE 1=1
    AND dc.collectionId IN ('drive.drive1', 'drive.drive2')
    AND oi.documentType IN ('documentType1', 'documentType2')
    AND oi.branch IN ('branch1', 'branch2')
    AND oi.scope IN ('scope1', 'scope2')
    AND oi.ordinal > $1  -- cursor position
ORDER BY oi.ordinal
LIMIT $2;
```

### Notes

- The `ordinal` field provides a simple, monotonically increasing cursor mechanism
- The `opId` unique constraint prevents duplicate operations
- JSONB is used for the `action` field to enable future JSON querying if needed
- When no drive filter is provided, the join with `document_collections` can be skipped
