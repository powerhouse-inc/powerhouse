import type {
  DocumentDriveDocument,
  DriveInput,
  FolderNode,
  Node,
} from "@powerhousedao/shared/document-drive";
import type {
  Action,
  AuthSubject,
  DocumentModelModule,
  Operation,
  PHDocument,
} from "@powerhousedao/shared/document-model";

import type {
  BatchExecutionRequest,
  BatchExecutionResult,
  BatchLoadRequest,
  BatchLoadResult,
} from "../core/types.js";
import type { Evaluation } from "../decision/types.js";
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

/** Retries taken when an upgrade conflicts with concurrent edits. */
export const DEFAULT_UPGRADE_CONFLICT_RETRIES = 3;

/**
 * Options for upgrading a document.
 */
export type UpgradeDocumentOptions = {
  /**
   * How many times to retry with a fresh read when the executor rejects the
   * upgrade because the document changed after it was read. Defaults to
   * {@link DEFAULT_UPGRADE_CONFLICT_RETRIES}.
   */
  maxConflictRetries?: number;
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
   * Returns nodes in the drive, optionally filtered by parent folder:
   * - omit `parentFolder` (or pass `undefined`) to list every node in the drive.
   * - pass `null` to list only root-level nodes.
   * - pass a folder id to list only the direct children of that folder.
   *
   * Returns a paged result so callers can stream through drives with very
   * large node counts without materialising the whole list in memory.
   */
  listNodes(
    driveIdentifier: string,
    parentFolder?: string | null,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<Node>>;
}

/**
 * One operation an authorization preflight predicts a verdict for. The input is
 * what a conditional grant reads, so a candidate standing for a filled-in form
 * carries that form's input.
 */
export type ActionCandidate = {
  scope: string;
  type: string;
  input?: unknown;
};

/**
 * The predicted verdicts for a set of candidates, in the order they were given,
 * with the aggregates a UI branches on.
 *
 * The aggregates are redundant -- a verdict is binary, so `allDenied` is
 * `!anyAllowed` and `anyDenied` is `!allAllowed` -- and all four are returned
 * so that a caller reads the one its question is phrased in rather than
 * negating another. Over no candidates every aggregate is false: nothing is
 * allowed and nothing is denied.
 */
export type ActionEvaluations = {
  evaluations: Evaluation[];
  allAllowed: boolean;
  anyAllowed: boolean;
  allDenied: boolean;
  anyDenied: boolean;
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
   * Resolves an identifier (either an id or a slug) to the canonical document
   * id, using the same lookup as the read/operation data paths. Resolves
   * against the "main" branch. Throws if the identifier cannot be resolved or
   * is ambiguous.
   *
   * @param identifier - Required, this is the document id or slug
   * @param signal - Optional abort signal to cancel the request
   * @returns The canonical document id
   */
  resolveIdOrSlug(
    identifier: string,
    view?: ViewFilter,
    signal?: AbortSignal,
  ): Promise<string>;

  /** True when the id is taken; a soft-deleted document's id is still taken. */
  isDocumentIdTaken(documentId: string, signal?: AbortSignal): Promise<boolean>;

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
   * Predicts whether the subject would be admitted to execute each of a set of
   * candidate operations, without submitting any of them. A UI asks this to
   * disable a control rather than offer an action that fails on submit.
   *
   * The answer is a prediction, not a promise. Three caveats hold:
   *
   * - Real admission compiles an append condition over everything it read and
   *   the store enforces it at write time. A preflight reads no future, so a
   *   policy change landing between this answer and the submit changes the
   *   verdict. The submit path stays the only authority.
   * - The verdict is evaluated at the stream heads. It is therefore correct for
   *   a candidate that will be stamped at or after every timestamp the
   *   evaluation read, which is the normal case for a control the user is about
   *   to click. A backdated submission is out of contract: the reactor decides
   *   that one by position, against the policy as it stood there.
   * - A candidate whose input decides the verdict needs that input supplied.
   *   With `authConditions` on, a conditional grant reads `action.input`, so
   *   omitting the input predicts the denial an empty input would earn rather
   *   than the verdict the filled-in form will get.
   *
   * Document-scope candidates are decided against the policy of the document
   * their input names, not the one passed here: delete and upgrade name it in
   * `input.documentId`, and the relationship actions in `input.sourceId`. This
   * follows the executor's own gate, which decides against the document
   * guarding the write. `CREATE_DOCUMENT` follows the gate's exemption: it runs
   * before its document exists, so the executor never decides it against a
   * policy and the preflight predicts allow.
   *
   * @param documentIdentifier - Document "id" or "slug" the candidates target
   * @param branch - Branch to evaluate against
   * @param candidates - Operations to predict a verdict for, each with the scope it would execute in
   * @param subject - Optional subject to decide for, defaulting to the client's own signer. A plain subject rather than a ViewFilter: the evaluation reads no view, so a filter's branch or scopes would be silently ignored here
   * @param signal - Optional abort signal to cancel the request
   * @returns One evaluation per candidate, in the order given, with the aggregates over them
   * @throws AuthEnforcementDisabledError if the reactor's authEnforcement flag is off, in which case it holds no decision model and the legacy host-table permission system cannot answer for one
   */
  evaluateActions(
    documentIdentifier: string,
    branch: string,
    candidates: ActionCandidate[],
    subject?: AuthSubject,
    signal?: AbortSignal,
  ): Promise<ActionEvaluations>;

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
   * Retrieves the document model module matching the version a document is
   * stamped with. Use this instead of {@link getDocumentModelModule}
   * whenever a specific document is in hand: the latest-wins lookup feeds
   * not-yet-upgraded documents the wrong reducer, diverging from replay.
   *
   * @param document - The document whose stamped version selects the module
   * @returns The document model module registered for that version
   * @throws UnsupportedDocumentModelVersionError if no module is registered for the stamped version
   */
  getDocumentModelModuleForDocument(
    document: PHDocument,
  ): Promise<DocumentModelModule<any>>;

  /**
   * Upgrades a document to a newer document model version by dispatching an
   * UPGRADE_DOCUMENT action. When toVersion is omitted, upgrades to the
   * latest registered module version for the document's type. Returns the
   * document unchanged when it is already at the target version.
   *
   * The action carries a snapshot of the document's version and per-scope
   * revisions, which the executor validates before persisting. When an edit
   * lands between the read and the upgrade executing, the upgrade is
   * rejected and retried with a fresh read up to
   * {@link UpgradeDocumentOptions.maxConflictRetries} times before the
   * conflict is surfaced.
   *
   * @param documentIdentifier - Target document id or slug
   * @param toVersion - Optional target document model version; defaults to latest
   * @param options - Optional upgrade options (maxConflictRetries)
   * @param signal - Optional abort signal to cancel the request
   * @returns The upgraded document
   * @throws DowngradeNotSupportedError if toVersion is less than the document's current version
   */
  upgradeDocument<TDocument extends PHDocument = PHDocument>(
    documentIdentifier: string,
    toVersion?: number,
    options?: UpgradeDocumentOptions,
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
   * Applies multiple mutation jobs in dependency order and waits for all to
   * complete. Actions on each job are signed by the client signer before
   * dispatch. Throws on the first failed job; the others may still execute
   * because dispatch is fire-and-await-all.
   *
   * @param request - Batch mutation request with per-job actions and dependsOn keys
   * @param signal - Optional abort signal to cancel the request
   * @returns The completed batch result (job ids keyed by plan key)
   */
  executeBatch(
    request: BatchExecutionRequest,
    signal?: AbortSignal,
  ): Promise<BatchExecutionResult>;

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
