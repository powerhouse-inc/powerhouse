import type {
  DocumentDriveDocument,
  DriveInput,
  FolderNode,
  Node,
} from "@powerhousedao/shared/document-drive";
import type {
  Action,
  DocumentModelModule,
  Operation,
  PHDocument,
} from "@powerhousedao/shared/document-model";

import type { BatchLoadRequest, BatchLoadResult } from "../core/types.js";
import type {
  JobInfo,
  PagedResults,
  PagingOptions,
  PropagationMode,
  SearchFilter,
  ViewFilter,
} from "../shared/types.js";
import type { OperationFilter } from "../storage/interfaces.js";

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
 * Options for creating an empty document.
 */
export type CreateDocumentOptions = {
  /** Optional "id" or "slug" of parent document */
  parentIdentifier?: string;
  /** Optional version of the document model to use (defaults to latest) */
  documentModelVersion?: number;
};

/**
 * Drive-aware operations grouped under `client.drives`.
 *
 * These methods orchestrate the multi-action, multi-document choreography
 * required to keep a drive's `state.global.nodes` array consistent with the
 * relationship index and the underlying documents. Use the flat
 * `IReactorClient` primitives (`get`, `execute`, `find`) for everything that
 * is not drive-aware.
 */
export interface IDriveClient {
  /**
   * Creates a new drive document and waits for completion.
   */
  create(
    input: DriveInput,
    signal?: AbortSignal,
  ): Promise<DocumentDriveDocument>;

  /**
   * Adds a document to a drive as a single batched operation.
   *
   * Issues CREATE_DOCUMENT, UPGRADE_DOCUMENT, ADD_RELATIONSHIP on the new
   * document and ADD_FILE on the drive in a single dependent batch.
   */
  addFile<TDocument extends PHDocument = PHDocument>(
    driveIdentifier: string,
    document: PHDocument,
    parentFolder?: string,
    signal?: AbortSignal,
  ): Promise<TDocument>;

  /**
   * Adds a folder node to a drive.
   */
  addFolder(
    driveIdentifier: string,
    name: string,
    parentFolder?: string,
    signal?: AbortSignal,
  ): Promise<FolderNode>;

  /**
   * Removes a node from a drive. Folder nodes cascade: descendant file
   * documents are deleted first, then the folder node entry itself.
   */
  removeNode(
    driveIdentifier: string,
    nodeId: string,
    signal?: AbortSignal,
  ): Promise<void>;

  /**
   * Renames a node. Updates both the underlying document header and the
   * drive's node entry.
   */
  renameNode(
    driveIdentifier: string,
    nodeId: string,
    name: string,
    signal?: AbortSignal,
  ): Promise<Node>;

  /**
   * Updates the preferred editor recorded in the document header meta for
   * a node. Pass `null` to clear it.
   */
  setPreferredEditorOnNode(
    nodeId: string,
    preferredEditor: string | null,
    signal?: AbortSignal,
  ): Promise<PHDocument>;

  /**
   * Moves a node to a different parent folder within the same drive.
   * Pass `undefined` to move the node to the drive root.
   */
  moveNode(
    driveIdentifier: string,
    srcNodeId: string,
    targetParentFolderId: string | undefined,
    signal?: AbortSignal,
  ): Promise<DocumentDriveDocument>;

  /**
   * Copies a node (and its subtree, if it is a folder) within a drive.
   * Each copied file gets a new id and a duplicated document.
   */
  copyNode(
    driveIdentifier: string,
    srcNodeId: string,
    targetParentFolderId: string | undefined,
    signal?: AbortSignal,
  ): Promise<DocumentDriveDocument>;

  /**
   * Returns a single node from the drive's `state.global.nodes` array.
   */
  getNode(
    driveIdentifier: string,
    nodeId: string,
    signal?: AbortSignal,
  ): Promise<Node>;

  /**
   * Returns nodes in the drive, optionally filtered to a single parent
   * folder. Pass `null` to list root-level nodes only.
   */
  listNodes(
    driveIdentifier: string,
    parentFolder?: string | null,
    signal?: AbortSignal,
  ): Promise<Node[]>;
}

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
   * Drive-aware operations. See {@link IDriveClient}.
   */
  readonly drives: IDriveClient;

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
  ): Promise<TDocument>;

  /**
   * Retrieves operations for a document.
   *
   * @param documentIdentifier - Required, this is either a document "id" field or a "slug"
   * @param view - Optional filter containing branch and scopes information
   * @param filter - Optional filter for actionTypes, timestamps, and revision
   * @param paging - Optional pagination options
   * @param signal - Optional abort signal to cancel the request
   * @returns Paginated list of operations
   */
  getOperations(
    documentIdentifier: string,
    view?: ViewFilter,
    filter?: OperationFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<Operation>>;

  /**
   * Retrieves outgoing relationships of a given type from a source document.
   *
   * @param sourceIdentifier - Required, this is either a document "id" field or a "slug"
   * @param relationshipType - The relationship type to filter by
   * @param view - Optional filter containing branch and scopes information
   * @param paging - Optional pagination options
   * @param signal - Optional abort signal to cancel the request
   * @returns The target documents and paging cursor
   */
  getOutgoingRelationships(
    sourceIdentifier: string,
    relationshipType: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<PHDocument>>;

  /**
   * Retrieves incoming relationships of a given type to a target document.
   *
   * @param targetIdentifier - Required, this is either a document "id" field or a "slug"
   * @param relationshipType - The relationship type to filter by
   * @param view - Optional filter containing branch and scopes information
   * @param paging - Optional pagination options
   * @param signal - Optional abort signal to cancel the request
   * @returns The source documents and paging cursor
   */
  getIncomingRelationships(
    targetIdentifier: string,
    relationshipType: string,
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
  create<TDocument extends PHDocument = PHDocument>(
    document: PHDocument,
    parentIdentifier?: string,
    signal?: AbortSignal,
  ): Promise<TDocument>;

  /**
   * Creates an empty document and waits for completion
   *
   * @param documentModelType - Type of document to create
   * @param options - Optional creation options (parentIdentifier, documentModelVersion)
   * @param signal - Optional abort signal to cancel the request
   */
  createEmpty<TDocument extends PHDocument>(
    documentModelType: string,
    options?: CreateDocumentOptions,
    signal?: AbortSignal,
  ): Promise<TDocument>;

  /**
   * Creates an empty document in a drive as a single batched operation.
   * This is more efficient than createEmpty + addFile as it batches all
   * actions into dependent jobs and waits for them to complete together.
   *
   * @deprecated Use {@link IDriveClient.addFile} via `client.drives.addFile`
   * instead. This method will be removed in a future release.
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
   * Updates the preferred editor in the document header meta and waits for completion.
   *
   * @param documentIdentifier - Target document id or slug
   * @param preferredEditor - The new preferred editor, or `null` to clear it
   * @param branch - Optional branch, defaults to "main"
   * @param signal - Optional abort signal to cancel the request
   * @returns The updated document.
   */
  setPreferredEditor(
    documentIdentifier: string,
    preferredEditor: string | null,
    branch?: string,
    signal?: AbortSignal,
  ): Promise<PHDocument>;

  /**
   * Adds a relationship between two documents and waits for completion.
   *
   * @param sourceIdentifier - Source document id or slug
   * @param targetIdentifier - Target document id or slug
   * @param relationshipType - Relationship type identifier
   * @param branch - Optional branch to add the relationship to, defaults to "main"
   * @param signal - Optional abort signal to cancel the request
   * @returns The updated source document
   */
  addRelationship(
    sourceIdentifier: string,
    targetIdentifier: string,
    relationshipType: string,
    branch?: string,
    signal?: AbortSignal,
  ): Promise<PHDocument>;

  /**
   * Removes a relationship between two documents and waits for completion.
   *
   * @param sourceIdentifier - Source document id or slug
   * @param targetIdentifier - Target document id or slug
   * @param relationshipType - Relationship type identifier
   * @param branch - Optional branch to remove the relationship from, defaults to "main"
   * @param signal - Optional abort signal to cancel the request
   * @returns The updated source document
   */
  removeRelationship(
    sourceIdentifier: string,
    targetIdentifier: string,
    relationshipType: string,
    branch?: string,
    signal?: AbortSignal,
  ): Promise<PHDocument>;

  /**
   * Moves a relationship from one source document to another and waits for completion.
   *
   * @param sourceParentIdentifier - Source parent document id or slug
   * @param targetParentIdentifier - Target parent document id or slug
   * @param targetIdentifier - The target document id or slug
   * @param relationshipType - Relationship type identifier
   * @param branch - Optional branch to apply the move to, defaults to "main"
   * @param signal - Optional abort signal to cancel the request
   * @returns The updated source and target documents
   */
  moveRelationship(
    sourceParentIdentifier: string,
    targetParentIdentifier: string,
    targetIdentifier: string,
    relationshipType: string,
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
   * Loads multiple batches of pre-existing operations across documents with dependency management.
   * Waits for all jobs to complete.
   *
   * @param request - Batch load request containing jobs with dependencies
   * @param signal - Optional abort signal to cancel the request
   * @returns Map of job keys to completed job information
   */
  loadBatch(
    request: BatchLoadRequest,
    signal?: AbortSignal,
  ): Promise<BatchLoadResult>;

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
