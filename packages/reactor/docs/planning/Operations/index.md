# Operations

### Summary

Operations are the fundamental units of change in the Reactor system. They represent atomic actions that transform document state and provide the foundation for the event-sourced architecture. Operations are immutable, ordered (though sometimes reshuffled), and provide complete auditability of all document changes.

### Core Structure

An Operation is an Action extended with metadata for storage, ordering, and execution tracking:

> TODO: Specify how operations/events will be versioned so that future refactors don't break things. Include guidelines for backward compatibility and event upcasting.

```tsx
/**
 * Core Operation type that combines action data with execution metadata
 */
type Operation<TAction extends Action = Action> = TAction & {
  /** Position of the operation in the history */
  index: number;

  /** Timestamp of when the operation was added */
  timestamp: string;

  /** Hash of the resulting document data after the operation */
  hash: string;

  /** The number of operations skipped with this Operation */
  skip: number;

  /** Error message for a failed action */
  error?: string;
	
  /** Unique operation id */
  id?: string;
};
```

### Action Structure

Actions define the intent and input data for operations:

```tsx
/**
 * Base structure for all actions
 */
type BaseAction<
  TType extends string,
  TInput,
  TScope extends OperationScope = OperationScope,
> = {
  /** The name of the action */
  type: TType;

  /** The payload of the action */
  input: TInput;

  /** The scope of the action, like 'global' or 'local' */
  scope: TScope;

  /** The attachments included in the action */
  attachments?: AttachmentInput[] | undefined;

  /** The context of the action */
  context?: ActionContext;
};
```

### Operation Scopes

Operations are organized by one or more scopes that determine their visibility and access patterns. An arbitrary number of scopes can be used to organize operations. The most common scopes are:

- **`global`** - Publicly visible operations
- **`local`** - Private operations for the current user/session
- **`public`** - Operations visible to specific groups

There is also one special scope that is always populated:

- **`header`** - Special scope for document metadata

### Operation Lifecycle

1. Creation - Operations are created through the mutation API.
2. Queueing - Operations are queued by document ID, scope, and branch to ensure proper ordering.
3. Execution - Operations are passed through reducers and executed in the order dictated by the queue.
4. Storage - Once applied, operations are persisted in the `IOperationStore` with atomic transactions.

> TODO: We need to document idempotency guarantees. Document exactly how the system prevents duplicate events from causing inconsistent state (e.g., using deterministic operation IDs or hash checks).

### Indexing

Operations are indexed by several keys for efficient retrieval:

```prisma
model Operation {
  id          String       @id @default(uuid())
  opId        String?
  documentId  String
  scope       String
  branch      String
  index       Int
  skip        Int
  hash        String
  timestamp   DateTime
  input       String
  type        String
  attachments Attachment[]
  syncId      String?
  clipboard   Boolean?     @default(false)
  context     Json?
  resultingState Bytes?

  @@unique([documentId, scope, branch, index(sort: Asc)], name: "unique_operation")
}
```

### Signature and Security

Operations include cryptographic signatures for verification:

```tsx
type ActionSigner = {
  user: {
    address: string;
    networkId: string; // CAIP-2
    chainId: number; // CAIP-10
  };
  app: {
    name: string; // eg "Connect" or "Powerhouse"
    key: string;
  };
  signatures: Signature[];
};

type ActionContext = {
  signer?: ActionSigner;
};
```

### Query Operations

#### Retrieving Operations

Operations can be queried by various criteria:

```tsx
// Get single operation
const operation = await operationStore.get(documentId, scope, branch, index);

// Get operations since an index
const operations = await operationStore.getSince(documentId, scope, branch, 10);

// Get operations since timestamp
const recentOps = await operationStore.getSinceTimestamp(
  documentId, scope, branch, timestampUtcMs
);
```

#### Document History API

Access operations through the document's history API:

```tsx
// Fetch operations for a scope
await document.history.global.fetch();

console.log(`Operations count: ${document.history.global.operations.length}`);

// Fetch operations up to a specific revision
const history = await document.history.global.fetch(10);
```

### Synchronization

Operations are synchronized using synchronization units:

```tsx
type SynchronizationUnit = {
  id: string;
  documentId: string;
  scope: string;
  branch: string;
  operations: Operation[];
};
```

### Error Handling

Operations can fail during execution:

```tsx
type Operation = {
  // ... other fields
  
  /** Error message for a failed action */
  error?: string;
};
```

Failed operations are retained in history for debugging and potential replay.

### Attachments

Operations can include binary attachments:

```tsx
type Attachment = {
  id: string;
  operationId: string;
  mimeType: string;
  data: string;
  filename?: string;
  extension?: string;
  hash: string;
};
```

### Dependencies

- None
