# Usage: IOperationStore

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