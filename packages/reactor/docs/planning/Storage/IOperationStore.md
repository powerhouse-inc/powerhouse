# IOperationStore

### Summary

- Append only: read/append access to raw operations.
- No dependencies on `PHDocument`.
- No dependencies on `Attachment`.
- Optimistic locking via the `opId`, `index`, and `skip` fields.
- All writes are atomic.
- Deterministic hashing.
- Submitting a duplicate operation will be rejected with a `DuplicateOperationError`, and reject the entire transaction.

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

  getSinceId(
    id: number,
    signal?: AbortSignal,
  ): Promise<Operation[]>;
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
  // this is the primary key for the operation store, serving as a global sequence number and a pivot
  id              Int          @id @default(autoincrement())

  // id of the job that created the operation
  jobId           String       @unique

  // stable id of the operation, to guarantee idempotency
  opId            String       @unique

  // serves as a causation id
  prevOpId        String

  // write timestamp of the operation (this is supplied by the db)
  writeTimestampUtcMs DateTime @default(now())

  // signed timestamp of the operation (this was submitted by the client)
  timestampUtcMs  DateTime
  documentId      String
  scope           String
  branch          String
  index           Int
  skip            Int
  action          Json
  resultingState  Json
  hash            String
  
  @@unique([documentId, scope, branch, (index + skip) ASC], name: "unique_operation")

  @@index([documentId, scope, branch], name: "streamId")
  @@index([documentId, scope], name: "branchlessStreamId")
}
```

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
  ORDER BY "index" DESC 
LIMIT 1;
```

Calculate next index and skip. Then submit operation.

```sql
INSERT INTO "Operation"
  ("documentId", "scope", "branch", "index", "skip", "action", "resultingState", "hash")
VALUES
  ($1, $2, $3, $4, $5, $6, $7, $8);
```

In the case that a write to the same stream was done in the time between read and write, the DB will bounce the write, as the `unique_operation` will not be unique. However, the only case in which this can happen is if there is a logic error with how the `IQueue` implementation is already queuing actions by stream.

If this same bad logic happened with a pessimistic lock, the second lock would wait on the previous conflicting operation before recalculating and inserting the second operation. This is, surprisingly, a big issue as our initial assumption about how the queue and job execution works is flawed, but the pessimistic lock allows the write anyway.
