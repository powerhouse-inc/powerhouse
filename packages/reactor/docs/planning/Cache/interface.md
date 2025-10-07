# Interface

```tsx
/**
 * Filter for querying operations from the operation index
 */
export type OperationFilter = {
  /** Array of drive IDs to include, use ["*"] for all */
  driveId: string[];

  /** Array of document IDs to include, use ["*"] for all */
  documentId: string[];

  /** Array of branches to include, use ["*"] for all */
  branch: string[];

  /** Array of document types to include, use ["*"] for all */
  documentType: string[];

  /** Array of operation scopes to include, use ["*"] for all */
  scope: string[];
};

/**
 * Represents a single operation in the operation index
 */
export type OperationIndexEntry = {
  /** Sequential ordinal number for ordering operations */
  ordinal: number;

  /** Unique operation identifier */
  opId: string;

  /** Document identifier */
  documentId: string;

  /** Type of the document */
  documentType: string;

  /** Operation scope */
  scope: string;

  /** Branch name */
  branch: string;

  /** UTC timestamp in milliseconds */
  timestampUtcMs: number;

  /** Operation index within the document */
  index: number;

  /** The operation action data */
  action: any;
};

/**
 * Options for querying operations from the operation index
 */
export type QueryOptions = {
  /** Optional cursor position to start from (exclusive) */
  fromOrdinal?: number;

  /** Optional limit on number of operations to return */
  limit?: number;
};

/**
 * Transaction handle for managing operation index writes
 */
export interface IOperationIndexTxn {
  /**
   * Writes operations to the operation index within the transaction.
   * Operations are staged but not visible until the transaction commits.
   *
   * @param operations - Array of operations to write
   */
  writeOperations(operations: OperationIndexEntry[]): void;

  /**
   * Adds documents to collections within the transaction.
   *
   * @param documentId - The document ID to add
   * @param collectionIds - Array of collection IDs to add the document to
   */
  addToCollections(documentId: string, collectionIds: string[]): void;
}

/**
 * The operation index provides an optimized, flattened view of operations
 * organized by collections for efficient querying by listeners and sync channels.
 */
export interface IOperationIndex {
  /**
   * Applies write operations atomically within a transaction.
   * The transaction automatically commits if the callback completes successfully,
   * or rolls back if an error is thrown.
   *
   * @param cursor - The new cursor position after successful commit
   * @param callback - Function that receives a transaction object for staging writes
   * @param signal - Optional abort signal to cancel the operation
   */
  apply(
    cursor: number,
    callback: (txn: IOperationIndexTxn) => Promise<void>,
    signal?: AbortSignal
  ): Promise<void>;

  /**
   * Queries operations from the operation index based on a filter.
   * Returns operations in ordinal order.
   *
   * @param filter - Filter criteria for operations
   * @param options - Query options including cursor and limit
   * @param signal - Optional abort signal to cancel the operation
   * @returns Array of matching operations
   */
  queryOperations(
    filter: OperationFilter,
    options?: QueryOptions,
    signal?: AbortSignal
  ): Promise<OperationIndexEntry[]>;

  /**
   * Gets the current cursor position (highest ordinal processed).
   * Used to determine which operations from IOperationStore have been cached.
   *
   * @param signal - Optional abort signal to cancel the operation
   * @returns Current cursor ordinal
   */
  getCursor(signal?: AbortSignal): Promise<number>;

  /**
   * Derives a set of collection IDs from an operation filter.
   * Used to pre-create collections for filters that may not yet have documents.
   *
   * @param filter - The operation filter
   * @returns Array of derived collection IDs
   */
  deriveCollectionIds(filter: OperationFilter): string[];

  /**
   * Ensures collections exist for the given filter.
   * Creates collection metadata but does not add any documents.
   *
   * @param filter - The operation filter to create collections for
   * @param signal - Optional abort signal to cancel the operation
   */
  ensureCollections(filter: OperationFilter, signal?: AbortSignal): Promise<void>;

  /**
   * Performs startup initialization and any necessary migrations.
   */
  startup(): Promise<void>;

  /**
   * Performs graceful shutdown, closing connections and flushing buffers.
   */
  shutdown(): Promise<void>;
}
```

### Usage

```tsx
// Writing to the operation index
await operationIndex.apply(newCursor, async (txn) => {
  // Add operations to the index
  txn.writeOperations([
    {
      ordinal: 1,
      opId: 'op-1',
      documentId: 'doc-1',
      documentType: 'budget',
      scope: 'global',
      branch: 'main',
      timestampUtcMs: Date.now(),
      index: 1,
      action: { type: 'create', input: {} }
    }
  ]);

  // Add document to collections
  const collectionIds = operationIndex.deriveCollectionIds({
    driveId: ['drive-1'],
    documentId: ['*'],
    branch: ['*'],
    documentType: ['*'],
    scope: ['*']
  });

  txn.addToCollections('doc-1', collectionIds);
});

// Querying operations for a listener
const operations = await operationIndex.queryOperations(
  {
    driveId: ['drive-1'],
    documentId: ['*'],
    branch: ['main'],
    documentType: ['budget'],
    scope: ['global']
  },
  {
    fromOrdinal: lastProcessedOrdinal,
    limit: 100
  }
);

// Getting the current cursor position
const cursor = await operationIndex.getCursor();
```

### Links

* [Schema](mdc:schema.md) - Database schema and table definitions
* [Overview](mdc:operation-index.md) - Detailed architectural overview
