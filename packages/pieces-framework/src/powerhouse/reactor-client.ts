// What a piece reaches of the reactor: subsets of IReactorClient, with the
// client's own signatures. Type-only, so the build emits no reactor import.
import type { IReactorClient } from "@powerhousedao/reactor";

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
// `execute`; `deleteDocument` refuses a cascade.
export type WriteMethods =
  | "create"
  | "createEmpty"
  | "execute"
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
  | "executeAsync"
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
  // Drive reads take no subject; pieces read a drive with `get`.
  | "drives";

// Fails to compile, naming the method, when a client gains one no list names.
export type Listed<T extends never> = T;
// The members of a client that no list names.
export type UnlistedMethods<C> = Exclude<
  keyof C,
  ReadMethods | WriteMethods | RefusedMethods
>;
export type ListedClient = Listed<UnlistedMethods<IReactorClient>>;

export type ReactorReadClient = Pick<IReactorClient, ReadMethods>;

export type ReactorClient = Pick<IReactorClient, ReadMethods | WriteMethods>;

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
