# ISyncStore

### Summary

- Read/write storage for synchronization primitives.

### Implementations

Only one implementation is provided: `KyselySyncStore`. This implementation uses Kysely on top of PGLite.

### Interface

```tsx
type StorageUnit = {
  /** The id of the document. If '*' then select all. */
  documentId: string;

  /** The type of the document model. If '*' then select all. */
  documentModelType: string;

  /** The scope of the document. If '*' then select all. */
  scope: string;

  /** The branch of the document. If '*' then select all. */
  branch: string;
};

type StorageUnitFilter = {
  /** The ids of the parent documents. If '*' then select all. */
  parentId?: string[];

  /** The ids of the documents. If '*' then select all. */
  documentId?: string[];

  /** The types of the document models. If '*' then select all. */
  documentModelType?: string[];

  /** The scopes of the documents. If '*' then select all. */
  scope?: string[];

  /** The branches of the documents. If '*' then select all. */
  branch?: string[];
};

/**
 * Finds storage units based on the provided filter.
 *
 * @param filter - The filter to apply.
 * @param paging - Paging options to use.
 * @param signal - Optional abort signal to cancel the request
 */
async findStorageUnitsBy(
  filter: StorageUnitFilter,
  paging: PagingOptions,
  signal?: AbortSignal,
): Promise<PagedResults<StorageUnit>>;
```
