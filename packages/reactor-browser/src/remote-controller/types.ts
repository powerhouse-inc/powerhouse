import type {
  Action,
  DocumentOperations,
  ISigner,
  PHBaseState,
  PHDocument,
  PHDocumentHeader,
} from "@powerhousedao/shared/document-model";
import type {
  GetDocumentOperationsQuery,
  PhDocumentFieldsFragment,
  PropagationMode,
  Sdk,
} from "../graphql/gen/schema.js";
export { PropagationMode } from "../graphql/gen/schema.js";

export type RemoteDocumentData = PhDocumentFieldsFragment;

export type RemoteOperation =
  GetDocumentOperationsQuery["documentOperations"]["items"][number];

export type RemoteOperationResultPage =
  GetDocumentOperationsQuery["documentOperations"];

export type ReactorGraphQLClient = Pick<
  Sdk,
  | "GetDocument"
  | "GetDocumentWithOperations"
  | "GetDocumentOperations"
  | "MutateDocument"
  | "CreateDocument"
  | "CreateEmptyDocument"
  | "DeleteDocument"
>;

/**
 * Options for creating a RemoteDocumentController.
 */
export type RemoteControllerOptions = {
  client: ReactorGraphQLClient;
  /** Remote document id. Omit for new documents. */
  documentId?: string;
  /** "batch" requires explicit push(), "streaming" auto-pushes after actions. Defaults to "batch" */
  mode?: "batch" | "streaming";
  /** Optional signer for action signing. */
  signer?: ISigner;
  /** Branch name, defaults to "main". */
  branch?: string;
  /** Parent document identifier for creating new documents. */
  parentIdentifier?: string;
  /** Conflict resolution strategy when remote has new operations. Default: no check (current behavior). */
  onConflict?: ConflictStrategy;
  /** Called when a streaming-mode push fails. If not provided, errors are silently swallowed. */
  onPushError?: (error: unknown) => void;
  /** Number of operations to fetch per page. Defaults to 100. */
  operationsPageSize?: number;
};

/**
 * Result of a push operation.
 */
export type PushResult = {
  remoteDocument: RemoteDocumentData;
  actionCount: number;
  /** The actions that were sent to the server (after signing, if applicable). */
  operations: ReadonlyArray<Action>;
};

/**
 * Sync status of the controller.
 */
export type SyncStatus = {
  pendingActionCount: number;
  connected: boolean;
  documentId: string;
  remoteRevision: Record<string, number>;
};

/**
 * A tracked action with operation context for signing.
 */
export type TrackedAction = {
  action: Action;
  prevOpHash: string;
  prevOpIndex: number;
};

/** Information about a detected conflict. */
export type ConflictInfo = {
  /** Remote operations added since the last pull, grouped by scope. */
  remoteOperations: Record<string, RemoteOperation[]>;
  /** Local actions pending push. */
  localActions: TrackedAction[];
  /** Remote revision at last pull. */
  knownRevision: Record<string, number>;
  /** Current remote revision. */
  currentRevision: Record<string, number>;
};

/** Custom merge handler receives conflict info and returns actions to push (or throws to abort). */
export type MergeHandler = (
  conflict: ConflictInfo,
) => Action[] | Promise<Action[]>;

/** Conflict resolution strategy. */
export type ConflictStrategy = "reject" | "rebase" | MergeHandler;

/** Event emitted when the document changes. */
export type RemoteDocumentChangeEvent = {
  source: "action" | "pull";
  document: PHDocument<PHBaseState>;
};

/** Listener for document change events. */
export type DocumentChangeListener = (event: RemoteDocumentChangeEvent) => void;

/** Result of fetching operations, including the cursor for incremental fetches. */
export type GetOperationsResult = {
  operationsByScope: Record<string, RemoteOperation[]>;
  /** Opaque cursor for resuming pagination. Undefined if there were no results. */
  cursor: string | undefined;
};

/** Result of fetching a document together with its first page of operations. */
export type GetDocumentWithOperationsResult = {
  document: RemoteDocumentData;
  childIds: ReadonlyArray<string>;
  /** First page of operations (may need further pagination if hasNextPage is true). */
  operations: GetOperationsResult;
  /** True if there are more pages of operations to fetch. */
  hasMoreOperations: boolean;
};

export interface IRemoteClient {
  getDocument(
    identifier: string,
    branch?: string,
  ): Promise<GetDocumentResult | null>;

  /** Fetch document metadata and the first page of operations in a single query. */
  getDocumentWithOperations(
    identifier: string,
    branch?: string,
    operationsCursor?: string,
  ): Promise<GetDocumentWithOperationsResult | null>;

  getAllOperations(
    documentId: string,
    branch?: string,
    sinceRevision?: number,
    scopes?: string[],
    cursor?: string,
  ): Promise<GetOperationsResult>;

  pushActions(
    documentIdentifier: string,
    actions: ReadonlyArray<NonNullable<unknown>>,
    branch?: string,
  ): Promise<RemoteDocumentData>;

  createDocument(
    document: NonNullable<unknown>,
    parentIdentifier?: string,
  ): Promise<RemoteDocumentData>;

  createEmptyDocument(
    documentType: string,
    parentIdentifier?: string,
  ): Promise<RemoteDocumentData>;

  deleteDocument(
    identifier: string,
    propagate?: PropagationMode,
  ): Promise<boolean>;
}

export type GetDocumentResult = {
  document: RemoteDocumentData;
  childIds: ReadonlyArray<string>;
};

export interface IRemoteController<TState extends PHBaseState = PHBaseState> {
  readonly header: PHDocumentHeader;
  readonly state: TState;
  readonly operations: DocumentOperations;
  readonly document: PHDocument<TState>;
  readonly status: SyncStatus;

  onChange(listener: DocumentChangeListener): () => void;
  push(): Promise<PushResult>;
  pull(): Promise<RemoteDocumentData>;
  delete(propagate?: PropagationMode): Promise<boolean>;
}
