// The ADR 0005 client subset tools run against. Type-only, so `./tools`
// emits no reactor import.
import type {
  IDriveWriteClient,
  IReactorClient,
  IReactorWriteClient,
} from "@powerhousedao/reactor";

export type ReactorToolReadMethods =
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

export type ReactorToolWriteMethods =
  | "create"
  | "createEmpty"
  | "execute"
  | "deleteDocument";

/** The write half's subset; each write returns a handle to await. */
export type ReactorToolWriteClient = Pick<
  IReactorWriteClient,
  ReactorToolWriteMethods
> & {
  readonly drives: Pick<IDriveWriteClient, "addFile">;
};

// Same shape as `ReactorClient` in @powerhousedao/pieces-framework.
export type ReactorToolClient = Pick<
  IReactorClient,
  ReactorToolReadMethods | "newDocument"
> & {
  readonly write: ReactorToolWriteClient;
};

export type ReactorToolReadClient = Pick<
  IReactorClient,
  ReactorToolReadMethods
>;
