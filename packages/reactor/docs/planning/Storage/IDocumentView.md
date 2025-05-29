# IDocumentView

### Summary

- Listens to `IEventBus` for operation store updates, which trigger it to rebuild / update pre-joined, denormalized views for application reads.
- Reads from `IOperationStore` as needed.
- Provides an API for `IReactor` or external systems to read document data from.

### Dependencies

- [IOperationStore](../Reactor/Interfaces/IOperationStore.md)
- [IDocumentIndexer](../Reactor/Interfaces/IDocumentIndexer.md)

### Interface

```tsx
interface IDocumentView {
  /**
   * Resolves a list of slugs from a list of ids.
   *
   * @param ids - Required, the list of document ids
   * @param view - Optional filter containing branch and scopes information
   * @returns The parallel list of slugs
   */
  resolveIds(ids: string[], view?: ViewFilter): Promise<string[]>;

  /**
   * Resolves a list of ids from a list of slugs.
   *
   * @param ids - Required, the list of document ids
   * @param view - Optional filter containing branch and scopes information
   * @returns The parallel list of ids
   */
  resolveSlugs(slugs: string[], view?: ViewFilter): Promise<string[]>;

  /**
   * Returns true if and only if the documents exist.
   *
   * @param documentIds - The list of document ids to check.
   */
  exists(documentIds: string[]): Promise<boolean[]>;

  /**
   * Returns the documents with the given ids.
   *
   * @param documentIds - The list of document ids to get.
   * @param view - Optional filter containing branch and scopes information
   */
  getMany<TDocument extends PHDocument>(
    documentIds: string[],
    view: ViewFilter,
  ): Promise<TDocument[]>;

  /**
   * Returns the documents with the given slugs.
   *
   * @param slugs - The list of document slugs to get.
   * @param view - Optional filter containing branch and scopes information
   */
  getManyBySlugs<TDocument extends PHDocument>(
    slugs: string[],
    view: ViewFilter,
  ): Promise<TDocument[]>;

  /**
   * Filters documents by criteria and returns a list of them
   *
   * @param search - Search filter options (type, parentId, identifiers)
   * @param view - Optional filter containing branch and scopes information
   * @param paging - Optional pagination options
   * @returns List of documents matching criteria and pagination cursor
   */
  find<TDocument extends PHDocument>(
    search: SearchFilter,
    view?: ViewFilter,
    paging?: PagingOptions,
  ): Promise<PagedResults<TDocument>>;

  /**
   * Returns the children of the given documents.
   *
   * @param parentIds - The list of parent document ids.
   */
  getChildren(parentIds: string[]): Promise<string[][]>;

  /**
   * Returns the parents of the given documents.
   *
   * @param childIds - The list of child document ids.
   */
  getParents(childIds: string[]): Promise<string[][]>;
}
```