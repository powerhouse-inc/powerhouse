// What a piece reaches of the reactor: subsets of IReactorClient, with the
// client's own signatures. Type-only, so the build emits no reactor import.
import type {
  IDriveClient,
  IDriveWriteClient,
  IReactorClient,
  IReactorWriteClient,
} from "@powerhousedao/reactor";

// The access an action or trigger declares; absent means no `ctx.reactor`.
export type RequireReactor = "read" | "write";

// What a block may set: `false` asks for no access, as leaving it out does.
export type ReactorDeclaration = RequireReactor | false;

export type ReadMethods =
  | "get"
  | "resolveIdOrSlug"
  | "find"
  | "getOperations"
  | "getOutgoingRelationships"
  | "getIncomingRelationships"
  | "getOutgoingRelationshipEdges"
  | "getIncomingRelationshipEdges"
  | "getDocumentModelModules"
  | "getDocumentModelModule"
  | "getDocumentModelModuleForDocument";

// The facade's writes, kept for pieces built against them; new pieces use
// `write`. `executeAsync` answers, once applied, with the job, not the document.
export type WriteMethods =
  | "newDocument"
  | "create"
  | "createEmpty"
  | "execute"
  | "executeAsync"
  | "deleteDocument";

// Offered to no piece; the host throws for them.
export type RefusedMethods =
  | "createDocumentInDrive"
  | "executeBatch"
  | "rename"
  | "setPreferredEditor"
  | "addRelationship"
  | "updateRelationship"
  | "removeRelationship"
  | "moveRelationship"
  | "upgradeDocument"
  | "deleteDocuments"
  | "createAsync"
  | "createEmptyAsync"
  | "getJobStatus"
  | "waitForJob"
  | "subscribe"
  | "loadBatch"
  | "evaluateActions"
  | "isDocumentIdTaken"
  | "isServed"
  | "getCreateSignaturePolicy"
  | "getCreateProtocolVersions"
  // The read half; a piece's write handles reach the few methods they need.
  | "read"
  | "getMany";

// The write half a piece gets as `write`: each write answers with a handle once
// its job is accepted. Pieces build actions with the model's action creators.
export type WriteHalfMethods =
  | "create"
  | "createEmpty"
  | "execute"
  | "deleteDocument";

export type DriveWriteHalfMethods = "addFile" | "addFolder";

// The write half's methods offered to no piece; the host throws for them.
export type RefusedWriteHalfMethods =
  | "isDocumentIdTaken"
  | "describe"
  | "evaluateActions"
  | "upgradeDocument"
  | "executeBatch"
  | "rename"
  | "setPreferredEditor"
  | "addRelationship"
  | "updateRelationship"
  | "removeRelationship"
  | "moveRelationship"
  | "deleteDocuments"
  | "loadBatch";

// `drives` is served as an object of these; `addFile` files a document into a
// drive of any drive type.
export type DriveReadMethods = "getNode" | "listNodes";

export type DriveWriteMethods = "addFile" | "addFolder";

export type RefusedDriveMethods =
  | "create"
  | "removeNode"
  | "renameNode"
  | "moveNode"
  | "copyNode"
  | "setPreferredEditorOnNode";

// Fails to compile, naming the method, when a client gains one no list names.
export type Listed<T extends never> = T;
// The members of a client that no list names.
export type UnlistedMethods<C> = Exclude<
  keyof C,
  ReadMethods | WriteMethods | RefusedMethods | "drives" | "write"
>;
export type ListedClient = Listed<UnlistedMethods<IReactorClient>>;
export type UnlistedWriteHalfMethods<C> = Exclude<
  keyof C,
  WriteHalfMethods | RefusedWriteHalfMethods | "drives"
>;
export type ListedWriteClient = Listed<
  UnlistedWriteHalfMethods<IReactorWriteClient>
>;
export type UnlistedDriveMethods<C> = Exclude<
  keyof C,
  DriveReadMethods | DriveWriteMethods | RefusedDriveMethods
>;
export type ListedDriveClient = Listed<UnlistedDriveMethods<IDriveClient>>;
export type ListedDriveWriteClient = Listed<
  Exclude<keyof IDriveWriteClient, DriveWriteHalfMethods | RefusedDriveMethods>
>;

/**
 * A read of a read-model index (a custom subgraph such as a key index),
 * answered in the host process as the run's user: the index's own access
 * declarations decide what the user sees, exactly as over HTTP, and no
 * credential or URL reaches the piece.
 */
export interface IndexQueryRequest {
  /** The subgraph's name, as registered on the host (`key-index`). */
  subgraph: string;
  /** A GraphQL query document; mutations are refused. */
  query: string;
  variables?: Record<string, unknown>;
}

export interface IndexQueryResult {
  data?: Record<string, unknown> | null;
  errors?: { message: string }[];
}

/** The read-model query a piece with reactor access may run. */
export interface IndexQueryMethods {
  query(
    request: IndexQueryRequest,
    signal?: AbortSignal,
  ): Promise<IndexQueryResult>;
}

export type ReactorReadClient = Pick<IReactorClient, ReadMethods> &
  IndexQueryMethods & {
    readonly drives: Pick<IDriveClient, DriveReadMethods>;
  };

export type ReactorWriteClient = Pick<IReactorWriteClient, WriteHalfMethods> & {
  readonly drives: Pick<IDriveWriteClient, DriveWriteHalfMethods>;
};

export type ReactorClient = Pick<IReactorClient, ReadMethods | WriteMethods> &
  IndexQueryMethods & {
    readonly drives: Pick<IDriveClient, DriveReadMethods | DriveWriteMethods>;
    readonly write: ReactorWriteClient;
  };

// The client a declaration grants.
export type ReactorClientFor<R extends RequireReactor> = R extends "write"
  ? ReactorClient
  : ReactorReadClient;

// What a declaration adds to a piece context: `reactor`, or nothing.
export type ReactorContext<R extends ReactorDeclaration | undefined> = [
  R,
] extends [RequireReactor]
  ? { reactor: ReactorClientFor<R> }
  : unknown;
