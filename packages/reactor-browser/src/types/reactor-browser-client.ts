import type {
  IReactorClient,
  IReactorReadClient,
  IReactorWriteClient,
} from "@powerhousedao/reactor";

/**
 * The reads the reactor-browser hooks make: a derived subset of
 * {@link IReactorReadClient}, so the signatures can never drift from the
 * reactor's own.
 */
export interface IReactorBrowserReadClient extends Pick<
  IReactorReadClient,
  | "get"
  | "getMany"
  | "find"
  | "getOperations"
  | "subscribe"
  | "waitForJob"
  | "getJobStatus"
> {}

/**
 * The writes the reactor-browser hooks make: a derived subset of
 * {@link IReactorWriteClient}. Each resolves once its job is accepted and
 * hands back a `WriteHandle`; a caller that needs the document reads it back
 * with `handle.document()`.
 */
export interface IReactorBrowserWriteClient extends Pick<
  IReactorWriteClient,
  "execute" | "create" | "deleteDocument"
> {}

/**
 * Minimal client contract the reactor-browser hooks depend on.
 *
 * It is a derived subset of {@link IReactorClient}, so the member signatures
 * can never drift from the reactor's own. Two implementations satisfy it: the
 * full in-browser reactor client (automatically, since it implements
 * `IReactorClient`) and `GraphQLReactorClient`, which talks plain GraphQL to a
 * Switchboard without bundling a reactor.
 *
 * `read` and `write` are the client halves the hooks use. The picked facade
 * methods are kept for callers that have not moved to the halves.
 *
 * Deliberately excluded: `drives`, relationships, `resolveIdOrSlug`,
 * `executeAsync`/`executeBatch`, `createEmpty`, `rename` and the document
 * model module getters.
 */
export interface IReactorBrowserClient extends Pick<
  IReactorClient,
  | "get"
  | "find"
  | "subscribe"
  | "execute"
  | "getOperations"
  | "create"
  | "deleteDocument"
> {
  readonly read: IReactorBrowserReadClient;
  readonly write: IReactorBrowserWriteClient;
}

/** The client halves `window.ph.reactor` holds. */
export type ReactorBrowserHalves = {
  read: IReactorBrowserReadClient;
  write: IReactorBrowserWriteClient;
};
