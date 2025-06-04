# IOperationStore

### Summary

- Append only: read/append access to raw operations.
- No dependencies on `PHDocument`.
- No dependencies on `Attachment`.
- All writes are atomic.
- Deterministic hashing.

### Interface

```tsx
interface IOperationStore {
  // this function throws named exceptions when it can't
  // acquire a lock, there are revision mismatches, or 
  // the changes cannot be applied atomically
  apply(
    documentId: string,
    scope: string,
    branch: string,
    revision: number,
    (txn: AtomicTxn) => void,
    signal?: AbortSignal,
  ): Promise<void>;
  
  getHeader(
    documentId: string,
    branch: string,
    revision: number,
    signal?: AbortSignal,
  ): Promise<DocumentHeader>;
  
  get(
    documentId: string,
    scope: string,
    branch: string,
    index: number,
    signal?: AbortSignal): Promise<Operation>;

  getSince(
    documentId: string,
    scope: string,
    branch: string,
    index: number,
    signal?: AbortSignal): Promise<Operation[]>;

  getSinceTimestamp(
    documentId: string,
    scope: string,
    branch: string,
    timestampUtcMs: number,
    signal?: AbortSignal): Promise<Operation[]>;
}

interface AtomicTxn {
	// append-only operations
	addOperations(...operations: Operation[]);
	
	// header operations
	setSlug(slug: string);
	setName(name: string);
}
```

### Usage

```tsx
await operations.apply(
	documentId, scope, branch, revision,
	async (txn) => {
		// get current state to pass to reducers
		const currentState = await readModel.get(documentId, scope, branch, revision);
		const { operations, header } = await applyReducers(currentState);
		
		// add new operations
	  txn.addOperations(...operations);
	  
	  // header operations
	  txn.setSlug('updated-slug');
	  txn.setName('updated-name');
	});
```

### Schema

The database schema, in prisma format, will look something like:

```prisma
model Operation {
  id              String       @id @default(uuid())
  opId            String       @unique
  // serves as a causation id
  prevOpId        String
  timestampUtcMs  DateTime
  documentId      String
  scope           String
  branch          String
  index           Int
  skip            Int
  action          Json
  resultingState  Json
  hash            String
  
  @@unique([documentId, scope, branch, index(sort: Asc)], name: "unique_operation")
}
```