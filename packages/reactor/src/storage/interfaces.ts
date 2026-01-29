import type { Operation, PHDocument } from "document-model";
import type {
  ConsistencyToken,
  PagedResults,
  PagingOptions,
} from "../shared/types.js";
import type { RemoteCursor, RemoteRecord } from "../sync/types.js";

export type { PagedResults, PagingOptions } from "../shared/types.js";

export type OperationContext = {
  documentId: string;
  documentType: string;
  scope: string;
  branch: string;
  resultingState?: string;

  // This is a _global_ ordinal that is increasing across all documents and scopes.
  ordinal: number;
};

export type OperationWithContext = {
  operation: Operation;
  context: OperationContext;
};

export class DuplicateOperationError extends Error {
  constructor(description: string) {
    super(`Duplicate operation: ${description}`);
    this.name = "DuplicateOperationError";
  }
}

export class OptimisticLockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OptimisticLockError";
  }
}

export class RevisionMismatchError extends Error {
  constructor(expected: number, actual: number) {
    super(`Revision mismatch: expected ${expected}, got ${actual}`);
    this.name = "RevisionMismatchError";
  }
}

export interface AtomicTxn {
  addOperations(...operations: Operation[]): void;
}

export type DocumentRevisions = {
  /** Map of scope to operation index for that scope */
  revision: Record<string, number>;

  /** Latest timestamp across revisions */
  latestTimestamp: string;
};

export interface IOperationStore {
  apply(
    documentId: string,
    documentType: string,
    scope: string,
    branch: string,
    revision: number,
    fn: (txn: AtomicTxn) => void | Promise<void>,
    signal?: AbortSignal,
  ): Promise<void>;

  getSince(
    documentId: string,
    scope: string,
    branch: string,
    revision: number,
    filter?: OperationFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<Operation>>;

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

export interface IKeyframeStore {
  putKeyframe(
    documentId: string,
    scope: string,
    branch: string,
    revision: number,
    document: PHDocument,
    signal?: AbortSignal,
  ): Promise<void>;

  findNearestKeyframe(
    documentId: string,
    scope: string,
    branch: string,
    targetRevision: number,
    signal?: AbortSignal,
  ): Promise<{ revision: number; document: PHDocument } | undefined>;

  deleteKeyframes(
    documentId: string,
    scope?: string,
    branch?: string,
    signal?: AbortSignal,
  ): Promise<number>;
}

export interface ViewFilter {
  branch?: string;
  scopes?: string[];
}

export interface SearchFilter {
  documentType?: string;
  parentId?: string;
  identifiers?: Record<string, any>;
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

export interface DocumentSnapshot {
  id: string;
  documentId: string;
  slug: string | null;
  name: string | null;
  scope: string;
  branch: string;
  content: string;
  documentType: string;
  lastOperationIndex: number;
  lastOperationHash: string;
  lastUpdatedAt: Date;
  snapshotVersion: number;
  identifiers: string | null;
  metadata: string | null;
  isDeleted: boolean;
  deletedAt: Date | null;
}

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

export type DocumentRelationship = {
  sourceId: string;
  targetId: string;
  relationshipType: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

export type DocumentGraphEdge = {
  from: string;
  to: string;
  type: string;
};

export interface IDocumentGraph {
  nodes: string[];
  edges: DocumentGraphEdge[];
}

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
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<DocumentRelationship[]>;

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
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<DocumentRelationship[]>;

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
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<DocumentRelationship[]>;

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
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<DocumentRelationship[]>;

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
 * A consistency-aware storage interface used by the Reactor when legacy storage
 * mode is enabled. This interface provides read-after-write consistency by
 * accepting an optional consistency token on read operations.
 *
 * This is a standalone interface (not extending IDocumentStorage) because the
 * method signatures differ - consistency token is added as an optional parameter
 * to read operations.
 */
export interface IConsistencyAwareStorage {
  /**
   * Returns the document with the given id.
   *
   * @param id - The id of the document to get
   * @param consistencyToken - Optional token for read-after-write consistency
   * @param signal - Optional abort signal to cancel the request
   */
  get<TDocument extends PHDocument>(
    id: string,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<TDocument>;

  /**
   * Returns the document with the given slug.
   *
   * @param slug - The slug of the document to get
   * @param consistencyToken - Optional token for read-after-write consistency
   * @param signal - Optional abort signal to cancel the request
   */
  getBySlug<TDocument extends PHDocument>(
    slug: string,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<TDocument>;

  /**
   * Returns true if the document exists.
   *
   * @param id - The id of the document to check
   * @param consistencyToken - Optional token for read-after-write consistency
   * @param signal - Optional abort signal to cancel the request
   */
  exists(
    id: string,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<boolean>;

  /**
   * Finds documents by their document type.
   *
   * @param type - The document type to search for
   * @param limit - Optional limit on the number of results
   * @param cursor - Optional cursor for pagination
   * @param consistencyToken - Optional token for read-after-write consistency
   * @param signal - Optional abort signal to cancel the request
   */
  findByType(
    type: string,
    limit?: number,
    cursor?: string,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<{ documents: string[]; nextCursor: string | undefined }>;

  /**
   * Returns the children of a document.
   *
   * @param id - The id of the parent document
   * @param consistencyToken - Optional token for read-after-write consistency
   * @param signal - Optional abort signal to cancel the request
   */
  getChildren(
    id: string,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<string[]>;

  /**
   * Resolves slugs to document IDs.
   *
   * @param slugs - The slugs to resolve
   * @param consistencyToken - Optional token for read-after-write consistency
   * @param signal - Optional abort signal to cancel the request
   */
  resolveIds(
    slugs: string[],
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<string[]>;

  /**
   * Resolves document IDs to slugs.
   *
   * @param ids - The document IDs to resolve
   * @param consistencyToken - Optional token for read-after-write consistency
   * @param signal - Optional abort signal to cancel the request
   */
  resolveSlugs(
    ids: string[],
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<string[]>;

  /**
   * Returns all parent documents of the child document with the given id.
   *
   * @param childId - The id of the child document
   * @param consistencyToken - Optional token for read-after-write consistency
   * @param signal - Optional abort signal to cancel the request
   */
  getParents(
    childId: string,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<string[]>;
}

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
   * @param signal - Optional abort signal to cancel the request
   * @returns The cursor
   */
  get(remoteName: string, signal?: AbortSignal): Promise<RemoteCursor>;

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
