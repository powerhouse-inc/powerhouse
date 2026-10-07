/**
 * The remote-Switchboard router backend (multi-reactor stage 4, WP-E).
 *
 * Reuses Connect's existing GraphQL seam -- `GraphQLReactorClient` -- as the
 * remote reactor's client, and adapts it to the full `IReactorClient` the
 * router's `ReactorBackend` requires. The client serves the read/write document
 * surface the Switchboard GraphQL schema exposes -- get, subscribe, execute,
 * getOperations, create, deleteDocument, `find`, the four relationship reads,
 * and now the batch surface (executeBatch, waitForJob, the create defaults and
 * setPreferredEditor) -- which this module delegates. Drive choreography is
 * served by handing those delegated primitives to the reference `DriveClient`
 * over a thin GraphQL-backed `IReactor` shim, so a remote drive edit runs the
 * same tested logic as a local one with no duplication. Every member still NOT
 * expressible over the schema (relationship WRITES, loadBatch, the rest of
 * `IReactor`) throws a typed {@link ReactorOperationNotSupportedError} naming
 * the backend and the member, rather than resolving to a silent wrong answer.
 * That honest-degradation posture is deliberate -- the same one
 * reactor-monitor's remote `unwired.ts` takes -- because a stub that read green
 * while nothing worked is the exact failure mode this initiative exists to
 * stamp out.
 *
 * `find` over GraphQL enumerates remote drives, so a remote reactor is now a
 * contributing backend in the router's collection-spanning fan-in rather than
 * an excluded one. Narrow cases still degrade: the Switchboard `findDocuments`
 * query filters by `type`/`parentId` only, at head, so a search naming
 * `ids`/`slugs` or a point-in-time view is refused with the typed signal --
 * drive enumeration filters by `type` at head, which is served.
 *
 * The error being TYPED (not a bare `Error`) is load-bearing for the router's
 * fan-in reads: a collection-spanning read recognises a refusing backend as NOT
 * APPLICABLE to the read and excludes it from the union, surfacing the
 * exclusion, instead of treating a by-contract limitation as a failure that
 * would make the whole read incomplete. A CAPABLE backend that errored at
 * runtime still fails that read loud -- the router draws the line on the error
 * type.
 */
import {
  DriveClient,
  POLLING_CHANNEL_TYPE,
  type BatchExecutionRequest,
  type IReactor,
  type IReactorClient,
  type SearchFilter,
  type ViewFilter,
} from "@powerhousedao/reactor";
import {
  findIsServableOverGraphQL,
  GraphQLReactorClient,
} from "@powerhousedao/reactor-browser";
import { ReactorOperationNotSupportedError } from "@powerhousedao/reactor-router";
import type {
  ReactorBackend,
  ReactorCapabilities,
} from "@powerhousedao/reactor-router";
import type { BearerTokenProvider } from "@powerhousedao/reactor-browser";
import type {
  DocumentModelModule,
  ISigner,
} from "@powerhousedao/shared/document-model";
import { logger } from "document-model";

/**
 * The `IReactorClient` members the GraphQL client serves by straight delegation.
 *
 * `find` is served too but is NOT listed here: it is handled specially so a
 * search naming `ids`/`slugs` or a point-in-time view -- which the Switchboard
 * `findDocuments` query cannot honour -- refuses with the typed signal rather
 * than returning every document or the head revision. See
 * {@link asFullReactorClient}.
 */
const DELEGATED_METHODS: ReadonlySet<string> = new Set([
  "get",
  "isServed",
  "subscribe",
  "execute",
  "executeBatch",
  "getOperations",
  "create",
  "deleteDocument",
  "waitForJob",
  "getCreateSignaturePolicy",
  "getCreateProtocolVersions",
  "setPreferredEditor",
  "getOutgoingRelationships",
  "getIncomingRelationships",
  "getOutgoingRelationshipEdges",
  "getIncomingRelationshipEdges",
]);

/**
 * The members served, for the not-supported message's served-list. `find` is
 * served specially (see {@link asFullReactorClient}); `drives` is served by the
 * reference {@link DriveClient}, built over the delegated batch primitives.
 */
const SERVED_METHODS: readonly string[] = [
  ...DELEGATED_METHODS,
  "find",
  "drives",
];

/**
 * A remote reactor reached over HTTP/GraphQL is not this process's to open,
 * close or heal; it registers its own processors in its own realm and routes a
 * resolver-driven `polling` sync channel. Mirrors reactor-monitor's
 * `remoteReactorCapabilities` shape without a live `info()` round trip --
 * placement needs the static contract, not a health reading.
 */
export function remoteSwitchboardCapabilities(): ReactorCapabilities {
  const capabilities: ReactorCapabilities = {
    hosting: "remote",
    storage: { kind: "remote", durable: true },
    processors: true,
    workflows: false,
    inspection: "none",
    syncChannels: [POLLING_CHANNEL_TYPE],
    selfHeal: false,
  };
  return Object.freeze(capabilities);
}

export type RemoteSwitchboardBackendOptions = {
  /** Stable router backend name. */
  name: string;
  /** The Switchboard's reactor GraphQL endpoint, e.g. `<origin>/graphql`. */
  graphqlUrl: string;
  /**
   * Signs the actions the remote `DriveClient` and the GraphQL client push.
   * Threaded from the logged-in Renown user at the build site; ambient signing
   * would resolve the same signer, so this makes the dependency explicit.
   */
  signer: ISigner;
  /** Models the client signs multi-action batches with. */
  documentModels?: readonly DocumentModelModule[];
  /** Defaults to the ambient Renown token provider (the logged-in user). */
  tokenProvider?: BearerTokenProvider;
};

/**
 * A thin `IReactor` shim backed by the GraphQL client, for the reference
 * `DriveClient` to run batch choreography over.
 *
 * `executeBatch` is the single `IReactor` member `DriveClient` touches (see
 * `packages/reactor/src/client/drive-client.ts` `runJobs`); every other member
 * is refused by name so a reach this backend did not foresee fails loudly
 * rather than returning a silent wrong answer.
 */
function asReactorShim(
  gql: GraphQLReactorClient,
  notSupported: (member: string, reason?: string) => never,
): IReactor {
  return new Proxy({} as IReactor, {
    get(_target, prop) {
      if (prop === "executeBatch") {
        return (request: BatchExecutionRequest, signal?: AbortSignal) =>
          gql.executeBatch(request, signal);
      }
      if (typeof prop !== "string" || prop === "then") {
        return undefined;
      }
      return (..._args: unknown[]) => notSupported(`reactor.${prop}`);
    },
  });
}

/**
 * Wraps the `GraphQLReactorClient` as a complete `IReactorClient`.
 *
 * A Proxy rather than a hand-written 25-method class: the codebase's own RPC
 * layer (`reactor-browser/src/rpc/client-proxy.ts`) is built the same way, and a
 * Proxy keeps the one honest rule in one place -- delegate what the GraphQL
 * client serves, refuse everything else by name -- instead of near-identical
 * throwing stubs. `then`/symbol reads resolve to undefined so the object is not
 * mistaken for a thenable by `await` or a promise check.
 *
 * `drives` is the reference {@link DriveClient}, handed this very proxy as its
 * read/write client and the GraphQL-backed {@link asReactorShim} as its reactor,
 * so a remote drive edit runs the same tested choreography as a local one with
 * no duplication. Its `resolveReference` is the identity: the remote resolves an
 * id or slug through `get`/`find` at the point of use, so a reference is handed
 * back unchanged rather than resolved against a local view.
 */
function asFullReactorClient(
  gql: GraphQLReactorClient,
  backendName: string,
  signer: ISigner,
): IReactorClient {
  const notSupported = (member: string, reason?: string): never => {
    throw new ReactorOperationNotSupportedError({
      backend: backendName,
      operation: member,
      reason:
        reason ??
        `its GraphQL client serves only ${SERVED_METHODS.join(
          ", ",
        )} in the router document surface (multi-reactor stage 4, WP-E)`,
    });
  };

  // `find` is served, except for a search or view the GraphQL query cannot
  // honour: an ids/slugs search or a point-in-time view refuses with the typed
  // signal so the router's fan-in excludes this backend from the union rather
  // than merging a wrongly-unfiltered or head-instead-of-revision page. The
  // single `findIsServableOverGraphQL` predicate -- shared with the client's own
  // `find` -- is what decides this, so the rule cannot drift between the two.
  const find = (...args: unknown[]): unknown => {
    const search = args[0] as SearchFilter;
    const view = args[1] as ViewFilter | undefined;
    if (!findIsServableOverGraphQL(search, view)) {
      return notSupported(
        "find",
        "the Switchboard findDocuments query filters only by type and parentId at head, so a search naming ids or slugs, or a point-in-time view, cannot be served over GraphQL (multi-reactor stage 4, WP-E)",
      );
    }
    return (gql.find as (...callArgs: unknown[]) => unknown)(...args);
  };

  const client: IReactorClient = new Proxy({} as IReactorClient, {
    get(_target, prop) {
      if (typeof prop !== "string" || prop === "then") {
        return undefined;
      }
      if (prop === "drives") {
        return drives;
      }
      if (prop === "find") {
        return find;
      }
      if (DELEGATED_METHODS.has(prop)) {
        const value = (gql as unknown as Record<string, unknown>)[prop];
        return typeof value === "function"
          ? (value as (...args: unknown[]) => unknown).bind(gql)
          : value;
      }
      return (..._args: unknown[]) => notSupported(prop);
    },
  });

  const drives = new DriveClient(
    client,
    logger,
    asReactorShim(gql, notSupported),
    signer,
    (id: string) => Promise.resolve(id),
  );

  return client;
}

/** Builds the remote-Switchboard backend the router routes remote drives to. */
export function createRemoteSwitchboardBackend(
  options: RemoteSwitchboardBackendOptions,
): ReactorBackend {
  const gql = new GraphQLReactorClient({
    url: options.graphqlUrl,
    documentModels: options.documentModels,
    tokenProvider: options.tokenProvider,
    signer: options.signer,
  });
  return {
    name: options.name,
    client: asFullReactorClient(gql, options.name, options.signer),
    capabilities: remoteSwitchboardCapabilities(),
  };
}
