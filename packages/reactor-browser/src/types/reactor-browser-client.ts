import type { IReactorClient } from "@powerhousedao/reactor";

/**
 * Minimal client contract the reactor-browser hooks depend on.
 *
 * It is a derived subset of {@link IReactorClient}, so the member signatures
 * can never drift from the reactor's own. Two implementations satisfy it: the
 * full in-browser reactor client (automatically, since it implements
 * `IReactorClient`) and `GraphQLReactorClient`, which talks plain GraphQL to a
 * Switchboard without bundling a reactor.
 *
 * Deliberately excluded: `drives`, relationships, `find`, `resolveIdOrSlug`,
 * `executeAsync`/`executeBatch`, jobs, `createEmpty`, `rename` and the document
 * model module getters.
 */
export interface IReactorBrowserClient extends Pick<
  IReactorClient,
  | "get"
  | "subscribe"
  | "execute"
  | "getOperations"
  | "create"
  | "deleteDocument"
> {}
