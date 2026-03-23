import type {
  Operation,
  OperationWithContext,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import type {
  ConsistencyToken,
  PagedResults,
  PagingOptions,
} from "../shared/types.js";
import type { ChannelErrorSource } from "../sync/types.js";
import type { RemoteCursor, RemoteRecord } from "../sync/types.js";

export type { PagedResults, PagingOptions } from "../shared/types.js";

/**
 * Thrown when an operation with the same identity already exists in the store.
 */
export class DuplicateOperationError extends Error {
  constructor(description: string) {
    super(`Duplicate operation: ${description}`);
    this.name = "DuplicateOperationError";
  }
}

/**
 * Thrown when a concurrent write conflict is detected during an atomic apply.
 */
export class OptimisticLockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OptimisticLockError";
  }
}

/**
 * Thrown when the caller-provided revision does not match the current
 * stored revision, indicating a stale read.
 */
export class RevisionMismatchError extends Error {
  constructor(expected: number, actual: number) {
    super(`Revision mismatch: expected ${expected}, got ${actual}`);
    this.name = "RevisionMismatchError";
  }
}

/**
 * A write transaction passed to {@link IOperationStore.apply}. Accumulates
 * operations that are committed atomically when the callback returns.
 */
export interface AtomicTxn {
  /** Stages one or more operations to be written as part of this transaction. */
  addOperations(...operations: Operation[]): void;
}

/**
 * Per-scope revision map for a document, used to reconstruct the header
 * revision field and lastModified timestamp.
 */
export type DocumentRevisions = {
  /** Map of scope to operation index for that scope */
  revision: Record<string, number>;

  /** Latest timestamp across revisions */
  latestTimestamp: string;
};

/**
 * Append-only store for document operations. Operations are partitioned by
 * (documentId, scope, branch) and ordered by a monotonic revision index.
 */
export interface IOperationStore {
  /**
   * Atomically appends operations for a single document/scope/branch.
   * The provided revision must match the current head; otherwise a
   * {@link RevisionMismatchError} is thrown.
   *
   * @param documentId - The document id
   * @param documentType - The document type identifier
   * @param scope - The operation scope (e.g. "global", "local")
   * @param branch - The branch name
   * @param revision - Expected current revision (optimistic lock)
   * @param fn - Callback that stages operations via {@link AtomicTxn}
   * @param signal - Optional abort signal to cancel the request
   */
  apply(
    documentId: string,
    documentType: string,
    scope: string,
    branch: string,
    revision: number,
    fn: (txn: AtomicTxn) => void | Promise<void>,
    signal?: AbortSignal,
  ): Promise<void>;

  /**
   * Returns operations for a document/scope/branch whose index is greater
   * than the given revision.
   *
   * @param documentId - The document id
   * @param scope - The operation scope
   * @param branch - The branch name
   * @param revision - Return operations after this revision index
   * @param filter - Optional filters (action types, timestamp range)
   * @param paging - Optional paging options for cursor-based pagination
   * @param signal - Optional abort signal to cancel the request
   */
  getSince(
    documentId: string,
    scope: string,
    branch: string,
    revision: number,
    filter?: OperationFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<Operation>>;

  /**
   * Returns operations across all documents whose auto-increment store id
   * is greater than the given id. Used by read models and sync to catch up
   * on operations they may have missed.
   *
   * @param id - Return operations with store id greater than this value
   * @param paging - Optional paging options for cursor-based pagination
   * @param signal - Optional abort signal to cancel the request
   */
  getSinceId(
    id: number,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<OperationWithContext>>;

  /**
   * Gets operations that may conflict with incoming operations during a load.
   *
   * @param documentId - The document id
   * @param scope - The scope to query
   * @param branch - The branch name
   * @param minTimestamp - Minimum timestamp (inclusive) as ISO string
   * @param paging - Optional paging options for cursor-based pagination
   * @param signal - Optional abort signal to cancel the request
   * @returns Paged results of operations that may conflict
   */
  getConflicting(
    documentId: string,
    scope: string,
    branch: string,
    minTimestamp: string,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<Operation>>;

  /**
   * Gets the latest operation index for each scope of a document, along with
   * the latest timestamp across all scopes. This is used to efficiently reconstruct
   * the revision map and lastModified timestamp for document headers.
   *
   * @param documentId - The document id
   * @param branch - The branch name
   * @param signal - Optional abort signal to cancel the request
   * @returns Object containing revision map and latest timestamp
   */
  getRevisions(
    documentId: string,
    branch: string,
    signal?: AbortSignal,
  ): Promise<DocumentRevisions>;
}

/**
 * Stores periodic document snapshots (keyframes) so that document state
 * can be reconstructed without replaying the full operation history.
 */
export interface IKeyframeStore {
  /**
   * Stores a document snapshot at a specific revision.
   *
   * @param documentId - The document id
   * @param scope - The operation scope
   * @param branch - The branch name
   * @param revision - The operation index this snapshot corresponds to
   * @param document - The full document state to persist
   * @param signal - Optional abort signal to cancel the request
   */
  putKeyframe(
    documentId: string,
    scope: string,
    branch: string,
    revision: number,
    document: PHDocument,
    signal?: AbortSignal,
  ): Promise<void>;

  /**
   * Finds the keyframe closest to (but not exceeding) the target revision.
   * Returns undefined if no keyframe exists for this document/scope/branch.
   *
   * @param documentId - The document id
   * @param scope - The operation scope
   * @param branch - The branch name
   * @param targetRevision - The desired revision upper bound
   * @param signal - Optional abort signal to cancel the request
   */
  findNearestKeyframe(
    documentId: string,
    scope: string,
    branch: string,
    targetRevision: number,
    signal?: AbortSignal,
  ): Promise<{ revision: number; document: PHDocument } | undefined>;

  /**
   * Lists all keyframes for a document, optionally filtered by scope and branch.
   *
   * @param documentId - The document id
   * @param scope - Optional scope filter
   * @param branch - Optional branch filter
   * @param signal - Optional abort signal to cancel the request
   */
  listKeyframes(
    documentId: string,
    scope?: string,
    branch?: string,
    signal?: AbortSignal,
  ): Promise<
    Array<{
      scope: string;
      branch: string;
      revision: number;
      document: PHDocument;
    }>
  >;

  /**
   * Deletes keyframes for a document. Optionally scoped to a specific
   * scope and/or branch.
   *
   * @param documentId - The document id
   * @param scope - Optional scope filter; omit to delete across all scopes
   * @param branch - Optional branch filter; omit to delete across all branches
   * @param signal - Optional abort signal to cancel the request
   * @returns The number of keyframes deleted
   */
  deleteKeyframes(
    documentId: string,
    scope?: string,
    branch?: string,
    signal?: AbortSignal,
  ): Promise<number>;
}

/**
 * Filters applied when reading document state from {@link IDocumentView}.
 */
export interface ViewFilter {
  /** Branch to read from. Defaults to the main branch when omitted. */
  branch?: string;
  /** Scopes to include. When omitted, all scopes are included. */
  scopes?: string[];
  /** Exclude operations originating from this remote name. */
  excludeSourceRemote?: string;
}

/**
 * Criteria for searching documents in storage-backed read models.
 * All provided fields are combined with AND logic.
 */
export interface SearchFilter {
  /** Filter by document type identifier. */
  documentType?: string;
  /** Filter by parent document id. */
  parentId?: string;
  /** Filter by arbitrary key-value identifiers stored on the document. */
  identifiers?: Record<string, any>;
  /** When true, include soft-deleted documents in results. */
  includeDeleted?: boolean;
}

/**
 * Filter options for querying operations. When multiple filters are provided,
 * they are combined with AND logic.
 */
export interface OperationFilter {
  /** Filter by action types (OR logic within array) */
  actionTypes?: string[];
  /** Filter operations with timestamp >= this value (ISO string) */
  timestampFrom?: string;
  /** Filter operations with timestamp <= this value (ISO string) */
  timestampTo?: string;
  /** Filter operations with index >= this value */
  sinceRevision?: number;
}

/**
 * Materialised read model that maintains document snapshots. Snapshots are
 * updated by indexing operations (which must include `resultingState`) and
 * queried with optional consistency tokens for read-after-write guarantees.
 */
export interface IDocumentView {
  /**
   * Initializes the view.
   */
  init(): Promise<void>;

  /**
   * Indexes a list of operations.
   *
   * @param items - Operations with context. Context MUST include ephemeral
   *                `resultingState` for optimization. IDocumentView never rebuilds
   *                documents from operations - it always requires resultingState.
   */
  indexOperations(items: OperationWithContext[]): Promise<void>;

  /**
   * Blocks until the view has processed the coordinates referenced by the
   * provided consistency token.
   *
   * @param token - Consistency token derived from the originating job
   * @param timeoutMs - Optional timeout window in milliseconds
   * @param signal - Optional abort signal to cancel the wait
   */
  waitForConsistency(
    token: ConsistencyToken,
    timeoutMs?: number,
    signal?: AbortSignal,
  ): Promise<void>;

  /**
   * Returns true if and only if the documents exist.
   *
   * @param documentIds - The list of document ids to check.
   * @param consistencyToken - Optional token for read-after-write consistency
   * @param signal - Optional abort signal to cancel the request
   */
  exists(
    documentIds: string[],
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<boolean[]>;

  /**
   * Returns the document with the given id.
   *
   * @param documentId - The id of the document to get.
   * @param view - Optional filter containing branch and scopes information
   * @param consistencyToken - Optional token for read-after-write consistency
   * @param signal - Optional abort signal to cancel the request
   */
  get<TDocument extends PHDocument>(
    documentId: string,
    view?: ViewFilter,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<TDocument>;

  /**
   * Returns the documents with the given ids.
   *
   * @param documentIds - The list of document ids to get.
   * @param view - Optional filter containing branch and scopes information
   * @param consistencyToken - Optional token for read-after-write consistency
   * @param signal - Optional abort signal to cancel the request
   */
  getMany<TDocument extends PHDocument>(
    documentIds: string[],
    view?: ViewFilter,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<TDocument[]>;

  /**
   * Returns the document with the given identifier (either id or slug).
   * Throws an error if the identifier matches both an id and a slug that refer to different documents.
   *
   * @param identifier - The id or slug of the document to get.
   * @param view - Optional filter containing branch and scopes information
   * @param consistencyToken - Optional token for read-after-write consistency
   * @param signal - Optional abort signal to cancel the request
   * @throws {Error} If identifier matches both an ID and slug referring to different documents
   */
  getByIdOrSlug<TDocument extends PHDocument>(
    identifier: string,
    view?: ViewFilter,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<TDocument>;

  /**
   * Finds documents by their document type.
   *
   * @param type - The document type to search for
   * @param view - Optional filter containing branch and scopes information
   * @param paging - Optional paging options for cursor-based pagination
   * @param consistencyToken - Optional token for read-after-write consistency
   * @param signal - Optional abort signal to cancel the request
   */
  findByType(
    type: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<PagedResults<PHDocument>>;

  /**
   * Resolves a slug to a document ID.
   *
   * @param slug - The slug to resolve
   * @param view - Optional filter containing branch and scopes information
   * @param consistencyToken - Optional token for read-after-write consistency
   * @param signal - Optional abort signal to cancel the request
   * @returns The document ID or undefined if the slug doesn't exist
   */
  resolveSlug(
    slug: string,
    view?: ViewFilter,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<string | undefined>;

  /**
   * Resolves a list of slugs to document IDs.
   *
   * @param slugs - The list of slugs to resolve.
   * @param view - Optional filter containing branch and scopes information
   * @param consistencyToken - Optional token for read-after-write consistency
   * @param signal - Optional abort signal to cancel the request
   * @returns The list of document IDs
   */
  resolveSlugs(
    slugs: string[],
    view?: ViewFilter,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<string[]>;

  /**
   * Resolves an identifier (either id or slug) to a document ID.
   * This is a lightweight alternative to getByIdOrSlug that returns just the ID
   * without fetching the full document.
   *
   * @param identifier - The id or slug to resolve
   * @param view - Optional filter containing branch and scopes information
   * @param consistencyToken - Optional token for read-after-write consistency
   * @param signal - Optional abort signal to cancel the request
   * @returns The document ID
   * @throws {Error} If document not found or identifier matches both an ID and slug referring to different documents
   */
  resolveIdOrSlug(
    identifier: string,
    view?: ViewFilter,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<string>;
}

/**
 * A directed relationship between two documents in the document graph.
 */
export type DocumentRelationship = {
  sourceId: string;
  targetId: string;
  relationshipType: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * A lightweight directed edge in a {@link IDocumentGraph}.
 */
export type DocumentGraphEdge = {
  from: string;
  to: string;
  type: string;
};

/**
 * A subgraph of the document relationship graph, returned by traversal
 * queries such as {@link IDocumentIndexer.findAncestors}.
 */
export interface IDocumentGraph {
  nodes: string[];
  edges: DocumentGraphEdge[];
}

/**
 * Read model that maintains a directed graph of document relationships.
 * Relationships are created and removed by indexing operations containing
 * ADD_RELATIONSHIP and REMOVE_RELATIONSHIP actions.
 */
export interface IDocumentIndexer {
  /**
   * Initializes the indexer and catches up on any missed operations.
   */
  init(): Promise<void>;

  /**
   * Indexes a list of operations to update the relationship graph.
   *
   * @param operations - Operations to index. Will process ADD_RELATIONSHIP and
   *                     REMOVE_RELATIONSHIP operations.
   */
  indexOperations(operations: OperationWithContext[]): Promise<void>;

  /**
   * Blocks until the indexer has processed the coordinates referenced by the
   * provided consistency token.
   *
   * @param token - Consistency token derived from the originating job
   * @param timeoutMs - Optional timeout window in milliseconds
   * @param signal - Optional abort signal to cancel the wait
   */
  waitForConsistency(
    token: ConsistencyToken,
    timeoutMs?: number,
    signal?: AbortSignal,
  ): Promise<void>;

  /**
   * Returns outgoing relationships from a document.
   *
   * @param documentId - The source document id
   * @param types - Optional filter by relationship types
   * @param consistencyToken - Optional token for read-after-write consistency
   * @param signal - Optional abort signal to cancel the request
   */
  getOutgoing(
    documentId: string,
    types?: string[],
    paging?: PagingOptions,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<PagedResults<DocumentRelationship>>;

  /**
   * Returns incoming relationships to a document.
   *
   * @param documentId - The target document id
   * @param types - Optional filter by relationship types
   * @param consistencyToken - Optional token for read-after-write consistency
   * @param signal - Optional abort signal to cancel the request
   */
  getIncoming(
    documentId: string,
    types?: string[],
    paging?: PagingOptions,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<PagedResults<DocumentRelationship>>;

  /**
   * Checks if a relationship exists between two documents.
   *
   * @param sourceId - The source document id
   * @param targetId - The target document id
   * @param types - Optional filter by relationship types
   * @param consistencyToken - Optional token for read-after-write consistency
   * @param signal - Optional abort signal to cancel the request
   */
  hasRelationship(
    sourceId: string,
    targetId: string,
    types?: string[],
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<boolean>;

  /**
   * Returns all undirected relationships between two documents.
   *
   * @param a - The ID of the first document
   * @param b - The ID of the second document
   * @param types - Optional filter by relationship types
   * @param consistencyToken - Optional token for read-after-write consistency
   * @param signal - Optional abort signal to cancel the request
   */
  getUndirectedRelationships(
    a: string,
    b: string,
    types?: string[],
    paging?: PagingOptions,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<PagedResults<DocumentRelationship>>;

  /**
   * Returns all directed relationships between two documents.
   *
   * @param sourceId - The source document id
   * @param targetId - The target document id
   * @param types - Optional filter by relationship types
   * @param consistencyToken - Optional token for read-after-write consistency
   * @param signal - Optional abort signal to cancel the request
   */
  getDirectedRelationships(
    sourceId: string,
    targetId: string,
    types?: string[],
    paging?: PagingOptions,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<PagedResults<DocumentRelationship>>;

  /**
   * Finds a path from source to target following directed edges.
   *
   * @param sourceId - The source document id
   * @param targetId - The target document id
   * @param types - Optional filter by relationship types
   * @param consistencyToken - Optional token for read-after-write consistency
   * @param signal - Optional abort signal to cancel the request
   * @returns Array of document ids representing the path, or null if no path exists
   */
  findPath(
    sourceId: string,
    targetId: string,
    types?: string[],
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<string[] | null>;

  /**
   * Returns all ancestors of a document in the relationship graph.
   *
   * @param documentId - The document id
   * @param types - Optional filter by relationship types
   * @param consistencyToken - Optional token for read-after-write consistency
   * @param signal - Optional abort signal to cancel the request
   */
  findAncestors(
    documentId: string,
    types?: string[],
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<IDocumentGraph>;

  /**
   * Returns all relationship types currently in the system.
   *
   * @param consistencyToken - Optional token for read-after-write consistency
   * @param signal - Optional abort signal to cancel the request
   */
  getRelationshipTypes(
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<string[]>;
}

/**
 * Persistent storage for sync remote configurations. Each remote represents
 * a connection to an external system that operations can be synced with.
 */
export interface ISyncRemoteStorage {
  /**
   * Lists all remotes.
   *
   * @param signal - Optional abort signal to cancel the request
   * @returns The remotes
   */
  list(signal?: AbortSignal): Promise<RemoteRecord[]>;

  /**
   * Gets a remote by name.
   *
   * @param name - The name of the remote
   * @param signal - Optional abort signal to cancel the request
   * @returns The remote
   */
  get(name: string, signal?: AbortSignal): Promise<RemoteRecord>;

  /**
   * Upserts a remote.
   *
   * @param remote - The remote to upsert
   * @param signal - Optional abort signal to cancel the request
   * @returns The remote
   */
  upsert(remote: RemoteRecord, signal?: AbortSignal): Promise<void>;

  /**
   * Removes a remote by name.
   *
   * @param name - The name of the remote
   * @param signal - Optional abort signal to cancel the request
   * @returns The remote
   */
  remove(name: string, signal?: AbortSignal): Promise<void>;
}

/**
 * Persistent storage for sync cursors that track inbox/outbox progress
 * per remote. Cursors allow sync to resume from where it left off.
 */
export interface ISyncCursorStorage {
  /**
   * Lists all cursors for a remote.
   *
   * @param remoteName - The name of the remote
   * @param signal - Optional abort signal to cancel the request
   * @returns The cursors
   */
  list(remoteName: string, signal?: AbortSignal): Promise<RemoteCursor[]>;

  /**
   * Gets a cursor for a remote.
   *
   * @param remoteName - The name of the remote
   * @param cursorType - The type of cursor ("inbox" or "outbox")
   * @param signal - Optional abort signal to cancel the request
   * @returns The cursor
   */
  get(
    remoteName: string,
    cursorType: "inbox" | "outbox",
    signal?: AbortSignal,
  ): Promise<RemoteCursor>;

  /**
   * Upserts a cursor.
   *
   * @param cursor - The cursor to upsert
   * @param signal - Optional abort signal to cancel the request
   * @returns The cursor
   */
  upsert(cursor: RemoteCursor, signal?: AbortSignal): Promise<void>;

  /**
   * Removes a cursor for a remote.
   *
   * @param remoteName - The name of the remote
   * @param signal - Optional abort signal to cancel the request
   * @returns The cursor
   */
  remove(remoteName: string, signal?: AbortSignal): Promise<void>;
}

/**
 * Serializable snapshot of a permanently failed SyncOperation.
 */
export type DeadLetterRecord = {
  id: string;
  jobId: string;
  jobDependencies: string[];
  remoteName: string;
  documentId: string;
  scopes: string[];
  branch: string;
  operations: OperationWithContext[];
  errorSource: ChannelErrorSource;
  errorMessage: string;
};

/**
 * Persists dead-lettered sync operations so they survive reactor restarts.
 */
export interface ISyncDeadLetterStorage {
  /**
   * Lists dead letters for a remote, ordered by ordinal DESC (newest first).
   *
   * @param remoteName - The name of the remote
   * @param paging - Optional paging options (cursor + limit)
   * @param signal - Optional abort signal to cancel the request
   * @returns Paged dead letter records
   */
  list(
    remoteName: string,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<DeadLetterRecord>>;

  /**
   * Adds a dead letter. Duplicate ids are silently ignored.
   *
   * @param deadLetter - The dead letter record to persist
   * @param signal - Optional abort signal to cancel the request
   */
  add(deadLetter: DeadLetterRecord, signal?: AbortSignal): Promise<void>;

  /**
   * Removes a single dead letter by id.
   *
   * @param id - The dead letter id
   * @param signal - Optional abort signal to cancel the request
   */
  remove(id: string, signal?: AbortSignal): Promise<void>;

  /**
   * Removes all dead letters for a remote.
   *
   * @param remoteName - The name of the remote
   * @param signal - Optional abort signal to cancel the request
   */
  removeByRemote(remoteName: string, signal?: AbortSignal): Promise<void>;

  /**
   * Returns distinct document IDs that have any dead letter record across all remotes.
   * Used to populate the quarantine set on startup.
   *
   * @param signal - Optional abort signal to cancel the request
   */
  listQuarantinedDocumentIds(signal?: AbortSignal): Promise<string[]>;
}
