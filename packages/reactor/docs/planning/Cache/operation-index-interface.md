# Interface

```tsx
export type OperationIndexEntry = {
  /** Document identifier */
  documentId: string;

  /** Document model type */
  documentType: string;

  /** Branch that the operation belongs to */
  branch: string;

  /** Scope that the operation belongs to */
  scope: string;

  /** Full operation payload as written to IOperationStore */
  operation: Operation;
};

export interface IOperationIndexTxn {
  /** Creates a collection (called when a collection root document is created) */
  createCollection(collectionId: string): void;

  /** Adds a document to an existing collection (via relationship operations) */
  addToCollection(collectionId: string, documentId: string): void;

  /** Writes operation rows to the index */
  write(operations: OperationIndexEntry[]): void;
}

export interface IOperationIndex {
  /** Starts a new transaction */
  start(): IOperationIndexTxn;

  /**
   * Commits a transaction.
   */
  commit(
    txn: IOperationIndexTxn,
    signal?: AbortSignal,
  ): Promise<void>;

  /**
   * Streams operations for a collection (optionally filtered by ViewFilter /
   * paged with PagingOptions).
   */
  find(
    collectionId: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<OperationIndexEntry>>;
}
```

### Usage

```tsx
const operation: Operation = /* reducer output */ {
  opId: 'op-1',
  documentId: 'doc-1',
  branch: 'main',
  scope: 'document',
  index: 1,
  timestampUtcMs: Date.now(),
  action: { type: 'CREATE_DOCUMENT', input: {} },
  skip: 0,
};

// Writing to the operation index
const txn = operationIndex.start();
txn.createCollection('collection.doc-123');

txn.write([
  {
    documentId: 'doc-1',
    documentType: 'budget',
    branch: 'main',
    scope: 'document',
    operation,
  },
]);

txn.addToCollection('collection.doc-123', 'doc-1');

await operationIndex.commit(txn);

// Query operations for a collection
const page = await operationIndex.find(
  'collection.doc-123',
  { branch: 'main', scopes: ['document'] },
  { cursor: '', limit: 100 },
);
```

### Links

* [Schema](mdc:schema.md) - Database schema and table definitions
* [Overview](mdc:operation-index.md) - Detailed architectural overview
