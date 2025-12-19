import type { Action, DocumentModelModule, PHDocument } from "document-model";

import type {
  JobInfo,
  PagedResults,
  PagingOptions,
  PropagationMode,
  SearchFilter,
  ViewFilter,
} from "../shared/types.js";

/**
 * Describes the types of document changes that can occur.
 */
export enum DocumentChangeType {
  Created = "created",
  Deleted = "deleted",
  Updated = "updated",
  ParentAdded = "parent_added",
  ParentRemoved = "parent_removed",
  ChildAdded = "child_added",
  ChildRemoved = "child_removed",
}

/**
 * Represents a change event for documents.
 */
export type DocumentChangeEvent = {
  type: DocumentChangeType;
  documents: PHDocument[];
  context?: {
    parentId?: string;
    childId?: string;
  };
};

/**
 * The ReactorClient interface that wraps lower-level APIs to provide
 * a simpler interface for document operations.
 *
 * Features:
 * - Wraps Jobs with Promises for easier async handling
 * - Manages signing of submitted Action objects
 * - Provides quality-of-life functions for common tasks
 * - Wraps subscription interface with ViewFilters
 */
export interface IReactorClient {
  /**
   * Retrieves a list of document model modules.
   *
   * @param namespace - Optional namespace like "powerhouse" or "sky", defaults to ""
   * @param paging - Optional pagination options
   * @param signal - Optional abort signal to cancel the request
   * @returns List of document model modules
   */
  getDocumentModelModules(
    namespace?: string,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<DocumentModelModule>>;

  /**
   * Retrieves a specific document model module by document type.
   *
   * @param documentType - The document type identifier
   * @returns The document model module
   */
  getDocumentModelModule(
    documentType: string,
  ): Promise<DocumentModelModule<any>>;

  /**
   * Retrieves a specific document by identifier (either id or slug).
   *
   * @param identifier - Required, this is the document id or slug
   * @param view - Optional filter containing branch and scopes information
   * @param signal - Optional abort signal to cancel the request
   * @returns The up-to-date PHDocument with scopes and list of child document ids
   */
  get<TDocument extends PHDocument>(
    identifier: string,
    view?: ViewFilter,
    signal?: AbortSignal,
  ): Promise<{
    document: TDocument;
    childIds: string[];
  }>;

  /**
   * Retrieves children of a document.
   *
   * @param parentIdentifier - Required, this is either a document "id" field or a "slug"
   * @param view - Optional filter containing branch and scopes information
   * @param paging - Optional pagination options
   * @param signal - Optional abort signal to cancel the request
   * @returns The up-to-date PHDocument and paging cursor
   */
  getChildren(
    parentIdentifier: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<PHDocument>>;

  /**
   * Retrieves parents of a document.
   *
   * @param childIdentifier - Required, this is either a document "id" field or a "slug"
   * @param view - Optional filter containing branch and scopes information
   * @param paging - Optional pagination options
   * @param signal - Optional abort signal to cancel the request
   * @returns The up-to-date PHDocument and paging cursor
   */
  getParents(
    childIdentifier: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<PHDocument>>;

  /**
   * Filters documents by criteria and returns a list of them
   *
   * @param search - Search filter options (type, parentId, identifiers)
   * @param view - Optional filter containing branch and scopes information
   * @param paging - Optional pagination options
   * @param signal - Optional abort signal to cancel the request
   * @returns List of documents matching criteria and pagination cursor
   */
  find(
    search: SearchFilter,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<PHDocument>>;

  /**
   * Creates a document and waits for completion
   *
   * @param document - Document with optional id, slug, parent, model type, and initial state
   * @param parentIdentifier - Optional "id" or "slug" of parent document
   * @param signal - Optional abort signal to cancel the request
   * @returns The created document
   */
  create(
    document: PHDocument,
    parentIdentifier?: string,
    signal?: AbortSignal,
  ): Promise<PHDocument>;

  /**
   * Creates an empty document and waits for completion
   *
   * @param documentType - Type of document to create.
   * @param parentIdentifier - Optional "id" or "slug" of parent document
   * @param signal - Optional abort signal to cancel the request
   */
  createEmpty<TDocument extends PHDocument>(
    documentType: string,
    parentIdentifier?: string,
    signal?: AbortSignal,
  ): Promise<TDocument>;

  /**
   * Creates an empty document in a drive as a single batched operation.
   * This is more efficient than createEmpty + addFile as it batches all
   * actions into dependent jobs and waits for them to complete together.
   *
   * @param driveId - The drive document id or slug
   * @param document - The document to create
   * @param parentFolder - Optional folder id within the drive
   * @param signal - Optional abort signal to cancel the request
   * @returns The created document
   */
  createDocumentInDrive<TDocument extends PHDocument>(
    driveId: string,
    document: PHDocument,
    parentFolder?: string,
    signal?: AbortSignal,
  ): Promise<TDocument>;

  /**
   * Applies a list of actions to a document and waits for completion
   *
   * @param documentIdentifier - Target document id or slug
   * @param branch - Branch to apply actions to
   * @param actions - List of actions to apply
   * @param signal - Optional abort signal to cancel the request
   * @returns The updated document
   */
  execute<TDocument extends PHDocument>(
    documentIdentifier: string,
    branch: string,
    actions: Action[],
    signal?: AbortSignal,
  ): Promise<TDocument>;

  /**
   * Submits a list of actions to a document
   *
   * @param documentIdentifier - Target document id or slug
   * @param branch - Branch to apply actions to
   * @param actions - List of actions to apply
   * @param signal - Optional abort signal to cancel the request
   * @returns The job
   */
  executeAsync(
    documentIdentifier: string,
    branch: string,
    actions: Action[],
    signal?: AbortSignal,
  ): Promise<JobInfo>;

  /**
   * Renames a document and waits for completion
   *
   * @param documentIdentifier - Target document id or slug
   * @param name - The new name of the document
   * @param branch - Optional branch to rename the document, defaults to "main"
   * @param signal - Optional abort signal to cancel the request
   * @returns The updated document.
   */
  rename(
    documentIdentifier: string,
    name: string,
    branch?: string,
    signal?: AbortSignal,
  ): Promise<PHDocument>;

  /**
   * Adds multiple documents as children to another and waits for completion
   *
   * @param parentIdentifier - Parent document id or slug
   * @param documentIdentifiers - List of document identifiers to add as children
   * @param branch - Optional branch to add children to, defaults to "main"
   * @param signal - Optional abort signal to cancel the request
   * @returns The updated parent document
   */
  addChildren(
    parentIdentifier: string,
    documentIdentifiers: string[],
    branch?: string,
    signal?: AbortSignal,
  ): Promise<PHDocument>;

  /**
   * Removes multiple documents as children from another and waits for completion
   *
   * @param parentIdentifier - Parent document identifiers
   * @param documentIdentifiers - List of document ids to remove as children
   * @param branch - Optional branch to remove children from, defaults to "main"
   * @param signal - Optional abort signal to cancel the request
   * @returns The updated parent document
   */
  removeChildren(
    parentIdentifier: string,
    documentIdentifiers: string[],
    branch?: string,
    signal?: AbortSignal,
  ): Promise<PHDocument>;

  /**
   * Moves multiple documents from one parent to another and waits for completion
   *
   * @param sourceParentIdentifier - Source parent document id or slug
   * @param targetParentIdentifier - Target parent document id or slug
   * @param documentIdentifiers - List of document identifiers to move
   * @param branch - Optional branch to move children to, defaults to "main"
   * @param signal - Optional abort signal to cancel the request
   * @returns The updated source and target documents
   */
  moveChildren(
    sourceParentIdentifier: string,
    targetParentIdentifier: string,
    documentIdentifiers: string[],
    branch?: string,
    signal?: AbortSignal,
  ): Promise<{
    source: PHDocument;
    target: PHDocument;
  }>;

  /**
   * Deletes a document and waits for completion
   *
   * @param identifier - Document identifier (id or slug)
   * @param propagate - Optional mode for handling children, CASCADE deletes child documents
   * @param signal - Optional abort signal to cancel the request
   * @returns a promise, resolving on deletion confirmation
   */
  deleteDocument(
    identifier: string,
    propagate?: PropagationMode,
    signal?: AbortSignal,
  ): Promise<void>;

  /**
   * Deletes documents and waits for completion
   *
   * @param identifiers - Document identifiers (ids or slugs)
   * @param propagate - Optional mode for handling children, CASCADE deletes child documents
   * @param signal - Optional abort signal to cancel the request
   * @returns a promise, resolving on deletion confirmation
   */
  deleteDocuments(
    identifiers: string[],
    propagate?: PropagationMode,
    signal?: AbortSignal,
  ): Promise<void>;

  /**
   * Retrieves the status of a job
   *
   * @param jobId - The job id
   * @param signal - Optional abort signal to cancel the request
   * @returns The job status
   */
  getJobStatus(jobId: string, signal?: AbortSignal): Promise<JobInfo>;

  /**
   * Waits for a job to complete
   *
   * @param jobId - The job id or job object
   * @param signal - Optional abort signal to cancel the request
   * @returns The result of the job
   */
  waitForJob(jobId: string | JobInfo, signal?: AbortSignal): Promise<JobInfo>;

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
