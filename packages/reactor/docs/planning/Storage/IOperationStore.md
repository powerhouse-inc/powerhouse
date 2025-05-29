# IOperationStore

### Summary

- Read/write access to raw operations.
- Very important that it has no dependencies on `PHDocument`.
- Very important that all writes are atomic.

### Interface

```tsx
//  [
//     signerAddress,
//     hash (docID, scope, operationID, operationName, operationInput),
//     prevStateHash,
//     signature bytes
//  ]
export type Signature = [string, string, string, string];

export type ActionSigner = {
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

export type ActionContext = {
  signer?: ActionSigner;
};

/**
 * Defines the basic structure of an action.
 */
export type BaseAction<
  TType extends string,
  TInput,
  TScope extends OperationScope = OperationScope,
> = {
  /** The name of the action. */
  type: TType;

  /** The payload of the action. */
  input: TInput;

  /** The scope of the action, like 'global' or 'local' */
  scope: TScope;

  /** The attachments included in the action. */
  attachments?: AttachmentInput[] | undefined;

  /** The context of the action. */
  context?: ActionContext;
};

export type BaseActionWithAttachment<
  TType extends string,
  TInput,
  TScope extends OperationScope,
> = BaseAction<TType, TInput, TScope> & {
  attachments: AttachmentInput[];
};

export type Operation<TAction extends Action = Action> = TAction & {
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
  ): Promise<void>;
  
  getHeader(
    documentId: string,
    branch: string,
    revision: number,
  ): Promise<DocumentHeader>;
  
  get(
	  documentId: string,
	  scope: string,
	  branch: string,
	  index: number): Promise<Operation>;
	
	getSince(
		documentId: string,
		scope: string,
		branch: string,
		index: number): Promise<Operation[]>;
	
	getSinceTimestamp(
		documentId: string,
		scope: string,
		branch: string,
		timestampUtcMs: number): Promise<Operation[]>;
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

```
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

  SynchronizationUnit SynchronizationUnit? @relation(fields: [syncId], references: [id], onDelete: Cascade)

  @@unique([documentId, scope, branch, index(sort: Asc)], name: "unique_operation")
}

model SynchronizationUnit {
  id         String       @id
  documentId String
  scope      String
  branch     String
  operations Operation[]
}

model Attachment {
  id          String    @id @default(uuid())
  operationId String
  Operation   Operation @relation(fields: [operationId], references: [id], onDelete: Cascade)

  mimeType  String
  data      String
  filename  String?
  extension String?
  hash      String
}
```