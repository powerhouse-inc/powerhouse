# Interface: IOperationStore

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