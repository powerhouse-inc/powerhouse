# Interface

```tsx
interface IReactorClient {
  /**
   * Retrieves a list of document model specifications
   * 
   * @param namespace - Optional namespace like "powerhouse" or "sky", defaults to ""
   * 
   * @returns List of document models
   */
  getDocumentModels(
    namespace?: string,
    paging?: PagingOptions,
  ): Promise<PagedResults<DocumentModelState>>;

  /**
   * Retrieves a specific PHDocument
   * 
   * @param identifier - Required, this is either a document "id" field or a "slug"
   * @param view - Optional filter containing branch and scopes information
   * 
   * @returns The up-to-date PHDocument with scopes and list of child document ids
   */
  get<TDocument extends PHDocument>(
    identifier: string,
    view?: ViewFilter,
  ): Promise<{
    document: TDocument;
    childIds: string[];
  }>;

  /**
   * Retrieves children of a document.
   * 
   * @param parentIdentifier - Required, this is either a document "id" field or a "slug"
   * @param view - Optional filter containing branch and scopes information
   * 
   * @returns The up-to-date PHDocument and paging cursor
   */
  getChildren(
    parentIdentifier: string,
    view?: ViewFilter,
    paging?: PagingOptions,
  ): Promise<PagedResults<PHDocument>>;

  /**
   * Retrieves parents of a document.
   * 
   * @param childIdentifier - Required, this is either a document "id" field or a "slug"
   * @param view - Optional filter containing branch and scopes information
   * 
   * @returns The up-to-date PHDocument and paging cursor
   */
  getParents(
    childIdentifier: string,
    view?: ViewFilter,
    paging?: PagingOptions,
  ): Promise<PagedResults<PHDocument>>;

  /**
   * Filters documents by criteria and returns a list of them
   * 
   * @param search - Search filter options (type, parentId, identifiers)
   * @param view - Optional filter containing branch and scopes information
   * @param paging - Optional pagination options
   * 
   * @returns List of documents matching criteria and pagination cursor
   */
  find(
    search: SearchFilter,
    view?: ViewFilter,
    paging?: PagingOptions,
  ): Promise<PagedResults<PHDocument>>;

  /**
   * Creates a document and waits for completion
   * 
   * @param document - Document with optional id, slug, parent, model type, and initial state
   * @param parentIdentifier - Optional "id" or "slug" of parent document
   * @returns The created document
   */
  create(
    document: PHDocument,
    parentIdentifier?: string,
  ): Promise<PHDocument>;

  /**
   * Creates an empty document and waits for completion
   * 
   * @param documentType - Type of document to create.
   * @param parentIdentifier - Optional "id" or "slug" of parent document
   */
  createEmpty<TDocument extends PHDocument>(
    documentType: string,
    parentIdentifier?: string,
  ): Promise<TDocument>;

  /**
   * Applies a list of operations to a document and waits for completion
   * 
   * @param documentIdentifier - Target document id or slug
   * @param operations - List of operations to apply
   * @param view - Optional filter containing branch and scopes information
   * @returns The updated document
   */
  mutate<TDocument extends PHDocument>(
    documentIdentifier: string,
    operations: Operation[],
    view?: ViewFilter,
  ): Promise<TDocument>;

  /**
   * Submits a list of operations to a document
   * 
   * @param documentIdentifier - Target document id or slug
   * @param operations - List of operations to apply
   * @param view - Optional filter containing branch and scopes information
   * @returns The job
   */
  mutateAsync<TDocument extends PHDocument>(
    documentIdentifier: string,
    operations: Operation[],
    view?: ViewFilter,
  ): Promise<JobInfo>;

  /**
   * Renames a document and waits for completion
   * 
   * @param documentIdentifier - Target document id or slug
   * @param name - The new name of the document
   * @param view - Optional filter
   * @returns The updated document.
   */
  rename(
    documentIdentifier: string,
    name: string,
    view?: ViewFilter,
  ): Promise<PHDocument>;

  /**
   * Adds multiple documents as children to another and waits for completion
   * 
   * @param parentIdentifier - Parent document id or slug
   * @param documentIdentifiers - List of document identifiers to add as children
   * @param view - Optional filter containing branch and scopes information
   * @returns The updated parent document
   */
  addChildren(
    parentIdentifier: string,
    documentIdentifiers: string[],
    view?: ViewFilter,
  ): Promise<PHDocument>;

  /**
   * Removes multiple documents as children from another and waits for completion
   * 
   * @param parentIdentifier - Parent document identifiers
   * @param documentIdentifiers - List of document ids to remove as children
   * @param view - Optional filter containing branch and scopes information
   * @returns The updated parent document
   */
  removeChildren(
    parentIdentifier: string,
    documentIdentifiers: string[],
    view?: ViewFilter,
  ): Promise<PHDocument>;

  /**
   * Moves multiple documents from one parent to another and waits for completion
   * 
   * @param sourceParentIdentifier - Source parent document id or slug
   * @param targetParentIdentifier - Target parent document id or slug
   * @param documentIdentifiers - List of document identifiers to move
   * @param view - Optional filter containing branch and scopes information
   * @returns The updated source and target documents
   */
  moveChildren(
    sourceParentIdentifier: string,
    targetParentIdentifier: string,
    documentIdentifiers: string[],
    view?: ViewFilter,
  ): Promise<{
    source: PHDocument,
    target: PHDocument,
  }>;

  /**
   * Deletes a document and waits for completion
   * 
   * @param identifier - Document identifier (id or slug)
   * @param propagate - Optional mode for handling children, CASCADE deletes child documents
   * @returns a promise, resolving on deletion confirmation
   */
  deleteDocument(
    identifier: string,
    propagate?: PropagationMode,
  ): Promise<void>;

  /**
   * Deletes documents and waits for completion
   * 
   * @param identifiers - Document identifiers (ids or slugs)
   * @param propagate - Optional mode for handling children, CASCADE deletes child documents
   * @returns a promise, resolving on deletion confirmation
   */
  deleteDocuments(
    identifiers: string[],
    propagate?: PropagationMode,
  ): Promise<void>;

  /**
   * Retrieves the status of a job
   * 
   * @param jobId - The job id
   * @returns The job status
   */
  getJobStatus(jobId: string): Promise<JobInfo>;

  /**
   * Waits for a job to complete
   * 
   * @param jobId - The job id or job object
   * @returns The result of the job
   */
  waitForJob(jobId: string | JobInfo): Promise<JobInfo>;

  /**
   * Subscribes to changes for documents matching specified filters
   *
   * @param search - Search filter options (type, parentId, identifiers)
   * @param callback - Function called when documents change with the change event details
   * @param view - Optional filter containing branch and scopes information
   * @returns A function that unsubscribes from the changes
   */
  subscribe(
    search: SearchFilter,
    callback: (event: DocumentChangeEvent) => void,
    view?: ViewFilter,
  ): () => void;
}

/**
 * Describes the types of document changes that can occur.
 */
enum DocumentChangeType {
  Created = "created",
  Deleted = "deleted",
  Updated = "updated",
  ParentAdded = "parent_added",
  ParentRemoved = "parent_removed",
  ChildAdded = "child_added",
  ChildRemoved = "child_removed"
}

/**
 * Represents a change event for documents.
 */
type DocumentChangeEvent = {
  type: DocumentChangeType;
  documents: PHDocument[];
  context?: {
    parentId?: string;
    childId?: string;
  };
}
```