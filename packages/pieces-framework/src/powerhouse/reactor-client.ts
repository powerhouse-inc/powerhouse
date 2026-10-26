// What a piece reaches of the reactor: subsets of IReactorClient, with the
// client's own signatures. Type-only, so the build emits no reactor import.
import type { IDriveClient, IReactorClient } from "@powerhousedao/reactor";

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

// Pieces build actions with the model's action creators and pass them to
// `execute`; `deleteDocument` refuses a cascade. `executeAsync` writes as
// `execute` does and, for a piece, also answers once the actions are applied,
// but with the job instead of the document: the write for a caller that has
// no use for the document, such as a file added to a large drive.
export type WriteMethods =
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
  // The client's halves; a piece reaches the reactor through the listed methods.
  | "read"
  | "write"
  | "getMany";

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
  ReadMethods | WriteMethods | RefusedMethods | "drives"
>;
export type ListedClient = Listed<UnlistedMethods<IReactorClient>>;
export type UnlistedDriveMethods<C> = Exclude<
  keyof C,
  DriveReadMethods | DriveWriteMethods | RefusedDriveMethods
>;
export type ListedDriveClient = Listed<UnlistedDriveMethods<IDriveClient>>;

export type ReactorReadClient = Pick<IReactorClient, ReadMethods> & {
  readonly drives: Pick<IDriveClient, DriveReadMethods>;
};

export type ReactorClient = Pick<IReactorClient, ReadMethods | WriteMethods> & {
  readonly drives: Pick<IDriveClient, DriveReadMethods | DriveWriteMethods>;
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
