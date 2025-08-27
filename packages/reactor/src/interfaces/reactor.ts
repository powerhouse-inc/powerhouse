import type {
  Action,
  DocumentModelState,
  Operation,
  PHDocument,
} from "document-model";

import type {
  JobInfo,
  JobStatus,
  PagedResults,
  PagingOptions,
  PropagationMode,
  SearchFilter,
  ShutdownStatus,
  ViewFilter,
} from "../shared/types.js";

/**
 * The main Reactor interface that serves as a facade for document operations.
 * This interface provides a unified API for document management, including
 * creation, retrieval, mutation, and deletion operations.
 *
 * Phase 2 of the refactoring plan: IReactor Facade (Strangler Fig Pattern)
 */
export interface IReactor {
  /**
   * Signals that the reactor should shutdown.
   */
  kill(): ShutdownStatus;

  /**
   * Retrieves a list of document model specifications
   *
   * @param namespace - Optional namespace like "powerhouse" or "sky", defaults to ""
   * @param paging - Optional options for paging data in large queries.
   * @param signal - Optional abort signal to cancel the request
   * @returns List of document models
   */
  getDocumentModels(
    namespace?: string,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<DocumentModelState>>;

  /**
   * Retrieves a specific PHDocument by id
   *
   * @param id - Required, this is the document id
   * @param view - Optional filter containing branch and scopes information
   * @param signal - Optional abort signal to cancel the request
   * @returns The up-to-date PHDocument with scopes and list of child document ids
   */
  get<TDocument extends PHDocument>(
    id: string,
    view?: ViewFilter,
    signal?: AbortSignal,
  ): Promise<{
    document: TDocument;
    childIds: string[];
  }>;

  /**
   * Retrieves a specific PHDocument by slug
   *
   * @param slug - Required, this is the document slug
   * @param view - Optional filter containing branch and scopes information
   * @param signal - Optional abort signal to cancel the request
   * @returns The up-to-date PHDocument with scopes and list of child document ids
   */
  getBySlug<TDocument extends PHDocument>(
    slug: string,
    view?: ViewFilter,
    signal?: AbortSignal,
  ): Promise<{
    document: TDocument;
    childIds: string[];
  }>;

  /**
   * Retrieves the operations for a document
   *
   * @param documentId - The document id
   * @param view - Optional filter containing branch and scopes information
   * @param paging - Optional pagination options
   * @param signal - Optional abort signal to cancel the request
   * @returns The list of operations
   */
  getOperations(
    documentId: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<Operation>>;

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
   * Creates a document
   *
   * @param document - Document with optional id, slug, parent, model type, and initial state
   * @param signal - Optional abort signal to cancel the request
   * @returns The job status
   */
  create(document: PHDocument, signal?: AbortSignal): Promise<JobStatus>;

  /**
   * Deletes a document
   *
   * @param id - Document id
   * @param propagate - Optional mode for handling children, CASCADE deletes child documents
   * @param signal - Optional abort signal to cancel the request
   * @returns The job id and status
   */
  deleteDocument(
    id: string,
    propagate?: PropagationMode,
    signal?: AbortSignal,
  ): Promise<JobInfo>;

  /**
   * Applies a list of actions to a document.
   *
   * @param id - Document id
   * @param actions - List of actions to apply
   * @param view - Optional filter containing branch and scopes information
   * @param signal - Optional abort signal to cancel the request
   * @returns The job id and status
   */
  mutate(
    id: string,
    actions: Action[],
    view?: ViewFilter,
    signal?: AbortSignal,
  ): Promise<JobInfo>;

  /**
   * Adds multiple documents as children to another
   *
   * @param parentId - Parent document id
   * @param documentIds - List of document ids to add as children
   * @param view - Optional filter containing branch and scopes information
   * @param signal - Optional abort signal to cancel the request
   * @returns The job id and status
   */
  addChildren(
    parentId: string,
    documentIds: string[],
    view?: ViewFilter,
    signal?: AbortSignal,
  ): Promise<JobInfo>;

  /**
   * Removes multiple documents as children from another
   *
   * @param parentId - Parent document id
   * @param documentIds - List of document ids to remove as children
   * @param view - Optional filter containing branch and scopes information
   * @param signal - Optional abort signal to cancel the request
   * @returns The job id and status
   */
  removeChildren(
    parentId: string,
    documentIds: string[],
    view?: ViewFilter,
    signal?: AbortSignal,
  ): Promise<JobInfo>;

  /**
   * Retrieves the status of a job
   *
   * @param jobId - The job id
   * @returns The job status
   */
  getJobStatus(jobId: string, signal?: AbortSignal): Promise<JobInfo>;
}
