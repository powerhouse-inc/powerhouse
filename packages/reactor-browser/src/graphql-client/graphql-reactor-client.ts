import type {
  DocumentChangeEvent,
  DocumentChangeType,
  OperationFilter,
  PagedResults,
  PagingOptions,
  PropagationMode,
  SearchFilter,
  ViewFilter,
} from "@powerhousedao/reactor";
import type {
  ISigner,
  PHDocumentState,
} from "@powerhousedao/shared/document-model";
import { normalizeDocumentModelVersion } from "@powerhousedao/shared/document-model";
import type {
  Action,
  DocumentModelModule,
  Operation,
  PHDocument,
} from "document-model";
import { logger } from "document-model";
import type { Variables } from "graphql-request";
import { createClient } from "../graphql/client.js";
import {
  DocumentChangeType as GqlDocumentChangeType,
  PropagationMode as GqlPropagationMode,
  type OperationsFilterInput,
  type PagingInput,
  type ViewFilterInput,
} from "../graphql/gen/schema.js";
import type { ReactorGraphQLClient } from "../graphql/types.js";
import { DOCUMENT_CHANGE_TYPE } from "../reactor-interop.js";
import { remoteOperationToLocal } from "../remote-controller/utils.js";
import type { IReactorBrowserClient } from "../types/reactor-browser-client.js";
import {
  phDocumentFromGetDocument,
  phDocumentFromMutation,
} from "./adapter.js";
import {
  ambientRenownTokenProvider,
  makeAuthMiddleware,
  type BearerTokenProvider,
} from "./auth.js";
import {
  MutateDocumentWithOperationsDocument,
  type MutateDocumentWithOperationsResult,
  type MutateDocumentWithOperationsVariables,
} from "./operations.js";
import { prepareSignedActions } from "./signing.js";
import { resolveDocumentModelModule } from "./static-package-manager.js";
import {
  describeGraphQLDocument,
  SubgraphSdkRegistry,
  type GraphQLRequestOptions,
  type SubgraphSdkFactory,
  type TypedGraphQLDocument,
} from "./subgraph.js";
import {
  makeAuthConnectionParams,
  startDocumentChangesSubscription,
  subscriptionsUrlFromGraphqlUrl,
  type DocumentChangesEventPayload,
} from "./subscriptions.js";

export type GraphQLReactorClientOptions = {
  /** The Switchboard GraphQL endpoint, e.g. `http://localhost:4001/graphql`. */
  url: string;

  /**
   * A pre-built SDK to use instead of the transport derived from `url`.
   * Mainly a test seam.
   *
   * A client built this way carries no auth middleware: the injected SDK owns
   * its own transport, and therefore its own headers.
   */
  graphqlClient?: ReactorGraphQLClient;

  /**
   * Resolves the bearer token sent with every request, per request.
   *
   * Defaults to {@link ambientRenownTokenProvider}, i.e. the token of the
   * logged-in Renown user, or none when nobody is logged in.
   */
  tokenProvider?: BearerTokenProvider;

  /**
   * The Switchboard GraphQL subscriptions endpoint, e.g.
   * `ws://localhost:4001/graphql/subscriptions`.
   *
   * Defaults to the endpoint derived from `url` by
   * {@link subscriptionsUrlFromGraphqlUrl}.
   */
  subscriptionsUrl?: string;

  /**
   * Whether server-pushed changes are delivered to subscribers.
   *
   * On by default: the first `subscribe` call opens a websocket and every
   * change the Switchboard reports is emitted to matching subscribers, so
   * documents another user, tab or processor writes invalidate the cache.
   *
   * Set it to `false` where there is no websocket to talk to. The client then
   * only emits the changes it made itself.
   */
  realtime?: boolean;

  /**
   * The document model modules used to sign a batch of two or more actions.
   *
   * Signing action N+1 needs the state action N leaves behind, and only the
   * document's own reducer can predict it - so a batch is signable only when
   * the module matching the document's type AND its exact
   * `state.document.version` is here. One action needs no prediction and is
   * signed without any of this.
   *
   * Read once, when the client is built. Below `GraphQLReactorProvider` this
   * is its `documentModels` prop; a client constructed directly passes its own.
   */
  documentModels?: readonly DocumentModelModule<any>[];

  /**
   * Signs the actions this client pushes, instead of the logged-in Renown user.
   *
   * Left out - the normal case - the signer is resolved per push from
   * `window.ph.renown`, so a page signs as whoever is logged in and pushes
   * unsigned when nobody is. Set it where there is no Renown to read: tests,
   * scripts, and integration suites that must sign deterministically.
   */
  signer?: ISigner;
};

/** Paging defaults, matching the reactor's own client. */
const defaultPaging: PagingOptions = { cursor: "0", limit: 100 };

/** A registered `subscribe` call. */
type ChangeListener = {
  search: SearchFilter;
  callback: (event: DocumentChangeEvent) => void;
};

/**
 * The marker {@link isGraphQLReactorClient} looks for.
 *
 * A page can end up with two copies of this module - an app that bundles a
 * package carrying its own copy, or a dev server that hot-replaced it - and
 * then `instanceof` compares an instance against the other copy's class object
 * and answers `false`. A branded property survives both.
 */
const graphQLReactorClientBrand = "__powerhouseGraphQLReactorClient" as const;

/**
 * A light implementation of {@link IReactorBrowserClient} that talks plain
 * GraphQL to a Switchboard, with no reactor in the bundle.
 *
 * It fills the same `window.ph` slots the full in-browser reactor client fills,
 * so the reactor-browser hooks cannot tell the two apart.
 */
export class GraphQLReactorClient implements IReactorBrowserClient {
  /** See {@link isGraphQLReactorClient}. */
  readonly [graphQLReactorClientBrand] = true;

  private readonly sdk: ReactorGraphQLClient;
  private readonly subgraphs: SubgraphSdkRegistry;
  private readonly listeners: ChangeListener[] = [];
  private readonly tokenProvider: BearerTokenProvider;
  private readonly subscriptionsUrl: string | undefined;
  private readonly documentModels: readonly DocumentModelModule<any>[];
  private readonly signer: ISigner | undefined;
  private stopRealtime: (() => void) | undefined;
  private realtimeStarted = false;
  private realtimeGeneration = 0;
  private realtimeErrorLogged = false;

  constructor(options: GraphQLReactorClientOptions) {
    this.tokenProvider = options.tokenProvider ?? ambientRenownTokenProvider;
    // Copied, not held: the caller's array must not be able to change which
    // reducer a later batch is signed with.
    this.documentModels = [...(options.documentModels ?? [])];
    this.signer = options.signer;
    this.subscriptionsUrl =
      options.realtime === false
        ? undefined
        : (options.subscriptionsUrl ??
          subscriptionsUrlFromGraphqlUrl(options.url));

    // The middleware wraps the generated SDK methods AND `RunDocument`, so the
    // hand-authored mutation is authenticated by the same code path.
    const middleware = makeAuthMiddleware(this.tokenProvider);
    this.sdk = options.graphqlClient ?? createClient(options.url, middleware);
    // Subgraph transports are always derived from `url` and always carry auth,
    // including when the reactor SDK above was injected: an injected SDK is a
    // test seam that owns its own transport, not a second endpoint.
    this.subgraphs = new SubgraphSdkRegistry(options.url, middleware);
  }

  async get<TDocument extends PHDocument>(
    identifier: string,
    view?: ViewFilter,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    const viewInput = viewFilterInputFromViewFilter(view);
    const result = await this.sdk.GetDocument(
      { identifier, view: viewInput },
      undefined,
      signal,
    );

    const document = result.document;
    if (!document) {
      throw new Error(`Document not found: ${identifier}`);
    }

    return phDocumentFromGetDocument<TDocument>(
      document.document,
      view?.branch,
    );
  }

  async getOperations(
    documentIdentifier: string,
    view?: ViewFilter,
    filter?: OperationFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<Operation>> {
    const viewInput = viewFilterInputFromViewFilter(view);
    const operationsFilter: OperationsFilterInput = {
      documentId: documentIdentifier,
      branch: viewInput?.branch,
      scopes: viewInput?.scopes,
      actionTypes: filter?.actionTypes,
      timestampFrom: filter?.timestampFrom,
      timestampTo: filter?.timestampTo,
      sinceRevision: filter?.sinceRevision,
    };
    const result = await this.sdk.GetDocumentOperations(
      { filter: operationsFilter, paging: pagingInputFromPaging(paging) },
      undefined,
      signal,
    );

    const page = result.documentOperations;
    const nextCursor = page.hasNextPage
      ? (page.cursor ?? undefined)
      : undefined;
    const effectivePaging = paging ?? defaultPaging;

    return {
      results: page.items.map((item) => remoteOperationToLocal(item)),
      options: effectivePaging,
      nextCursor,
      totalCount: page.totalCount,
      next: nextCursor
        ? () =>
            this.getOperations(
              documentIdentifier,
              view,
              filter,
              { cursor: nextCursor, limit: effectivePaging.limit },
              signal,
            )
        : undefined,
    };
  }

  async create<TDocument extends PHDocument = PHDocument>(
    document: PHDocument,
    parentIdentifier?: string,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    const result = await this.sdk.CreateDocument(
      { document, parentIdentifier },
      undefined,
      signal,
    );

    const created = phDocumentFromGetDocument<TDocument>(result.createDocument);
    this.emitChange({
      type: DOCUMENT_CHANGE_TYPE.Created,
      documents: [created],
    });
    return created;
  }

  /**
   * Pushes actions to the Switchboard and returns the updated document.
   *
   * The document is fetched first: the response is the baseline for the
   * `sinceRevision` filter that narrows the returned operations to the ones
   * this call appended, and it carries the state hash a signed action is
   * stamped with.
   *
   * The emitted `Updated` event carries the document's id, never the
   * identifier this was called with: subscribers - including `DocumentCache` -
   * work in id space.
   */
  async execute<TDocument extends PHDocument>(
    documentIdentifier: string,
    branch: string,
    actions: Action[],
    signal?: AbortSignal,
  ): Promise<TDocument> {
    const document = await this.get(documentIdentifier, { branch }, signal);
    const preparedActions = await prepareActionsForPush(
      actions,
      document,
      this.documentModels,
      this.signer,
      signal,
    );

    const variables: MutateDocumentWithOperationsVariables = {
      documentIdentifier,
      actions: preparedActions,
      view: { branch },
      sinceRevision: sinceRevisionForActions(document, actions),
      scopes: scopesForActions(actions),
      branch,
    };
    const result =
      await this.sdk.RunDocument<MutateDocumentWithOperationsResult>({
        operationName: "MutateDocumentWithOperations",
        operationType: "mutation",
        document: MutateDocumentWithOperationsDocument,
        variables,
        signal,
      });

    const mutated = result.mutateDocument;
    const updated = phDocumentFromMutation<TDocument>(
      mutated,
      mutated.operations?.items ?? [],
      branch,
    );
    this.emitChange({
      type: DOCUMENT_CHANGE_TYPE.Updated,
      documents: [updated],
    });
    return updated;
  }

  /**
   * Deletes a document and announces it as a `Deleted` event.
   *
   * Pass a document id. The server resolves a slug just as happily, but
   * `deleteDocument` returns a boolean - there is no document left to read an
   * id off - so the identifier is announced verbatim on `context.childId`. A
   * subscriber keyed by id, `DocumentCache` included, therefore only reacts to
   * a delete by id.
   */
  async deleteDocument(
    identifier: string,
    propagate?: PropagationMode,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.sdk.DeleteDocument(
      { identifier, propagate: propagationModeInput(propagate) },
      undefined,
      signal,
    );

    this.emitChange({
      type: DOCUMENT_CHANGE_TYPE.Deleted,
      documents: [],
      context: { childId: identifier },
    });
  }

  /**
   * Registers a change subscriber and returns its unsubscribe function.
   *
   * Two things produce the events delivered here. Every successful `create`,
   * `execute` and `deleteDocument` emits one, which is what makes a
   * `DocumentCache` built on this client invalidate after a dispatch. And,
   * unless realtime is switched off, the first call to this method opens a
   * websocket to the Switchboard and every change it reports - from another
   * user, another tab or a server-side processor - is emitted too. A write of
   * this client's own is therefore announced twice, once locally and once by
   * the server; the cache refetches twice, which is harmless.
   *
   * A websocket that cannot be opened or is refused is logged once and then
   * ignored: realtime is an enhancement, never a dependency. The failed socket
   * is closed, so the next subscriber to arrive tries again.
   *
   * `view` is accepted for interface compatibility and ignored: the emitted
   * documents are whatever the write returned, so there is nothing to re-scope.
   *
   * Events live in id space: `search.ids` is matched against the resolved
   * document id, never against the identifier the write was issued with. The
   * one exception is `deleteDocument`, which has no document to resolve an id
   * from - see its own note. A `DocumentCache` on this client must therefore
   * be read by id: a slug-keyed entry is never invalidated.
   */
  subscribe(
    search: SearchFilter,
    callback: (event: DocumentChangeEvent) => void,
    view?: ViewFilter,
  ): () => void {
    const listener: ChangeListener = { search, callback };
    this.listeners.push(listener);
    this.startRealtime();

    return () => {
      const index = this.listeners.indexOf(listener);
      if (index !== -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Closes the realtime socket, if one was opened.
   *
   * Registered subscribers are left in place: they still receive the events
   * this client produces itself.
   *
   * Disposing is NOT final - a later `subscribe` opens a new socket. React
   * remounts a tree by running an effect's cleanup and then the effect again,
   * on the same client, and `StrictMode` does exactly that on every mount; a
   * terminal flag here would leave those pages without realtime for good, with
   * nothing logged.
   */
  dispose(): void {
    this.teardownRealtime();
  }

  /**
   * Binds a project's generated SDK to this client's transport and auth.
   *
   * Subgraphs are served next to the reactor's own supergraph, so the endpoint
   * is derived from the client's `url` by appending the name, and the SDK is
   * handed the same auth middleware every reactor call goes through. An app
   * therefore configures one URL and one token provider, and reaches every
   * capability of its Switchboard through this one client.
   *
   * `getSdk` is the function a GraphQL code generator emits for the subgraph's
   * schema - see the README in this folder for the codegen recipe.
   *
   * Transport and typing only. Subgraph results are not cached, produce no
   * change events and never reach `useDocument`.
   */
  subgraph<TSdk>(name: string, getSdk: SubgraphSdkFactory<TSdk>): TSdk {
    return this.subgraphs.get(name, getSdk);
  }

  /**
   * Runs a one-off GraphQL document against the Switchboard's own endpoint,
   * through the same transport and auth as everything else.
   *
   * The escape hatch for an operation not worth generating an SDK for. Pass a
   * document a code generator typed and the result type follows; pass a plain
   * `gql` document or a string and name the result type at the call site.
   */
  async request<TResult = unknown, TVariables extends Variables = Variables>(
    document: TypedGraphQLDocument<TResult, TVariables> | string,
    variables?: TVariables,
    options?: GraphQLRequestOptions,
  ): Promise<TResult> {
    const described = describeGraphQLDocument(document);
    return this.sdk.RunDocument<TResult>({
      operationName: options?.operationName ?? described.operationName,
      operationType: options?.operationType ?? described.operationType,
      document,
      variables,
      signal: options?.signal,
    });
  }

  /**
   * Opens the realtime socket on the first subscriber.
   *
   * The subscription is a firehose - no `search` argument - and this client
   * applies each subscriber's own filter on the way out, exactly as it does for
   * its own emissions.
   */
  private startRealtime(): void {
    if (!this.subscriptionsUrl || this.realtimeStarted) {
      return;
    }

    this.realtimeStarted = true;
    const generation = this.realtimeGeneration;
    const stop = startDocumentChangesSubscription({
      wsUrl: this.subscriptionsUrl,
      connectionParams: makeAuthConnectionParams(this.tokenProvider),
      onEvent: (event) => this.emitServerEvent(event),
      onError: (error) => this.handleRealtimeFailure(generation, error),
    });

    if (this.realtimeGeneration !== generation) {
      // The socket failed while it was being opened, so the failure was handled
      // before this stop function existed. Close what it holds.
      stop();
      return;
    }
    this.stopRealtime = stop;
  }

  /**
   * Gives up on a failed socket so that a later subscriber can try again.
   *
   * `graphql-ws` retries on its own and only reports here once it has given up,
   * or once the server refused the subscription outright - which is what an
   * auth-enabled Switchboard does to an anonymous subscriber. Keeping the dead
   * stop function would make every later `subscribe` a no-op, so realtime would
   * stay off for the life of the page even after the user signs in.
   *
   * The generation stamp discards a report from a socket that has already been
   * replaced or disposed.
   */
  private handleRealtimeFailure(generation: number, error: unknown): void {
    if (generation !== this.realtimeGeneration) {
      return;
    }
    this.teardownRealtime();
    this.logRealtimeError(error);
  }

  /** Closes the socket and lets a later subscriber open a new one. */
  private teardownRealtime(): void {
    this.realtimeGeneration += 1;
    this.realtimeStarted = false;
    this.stopRealtime?.();
    this.stopRealtime = undefined;
  }

  /** Maps a server event onto the client-side event and emits it. */
  private emitServerEvent(event: DocumentChangesEventPayload): void {
    this.emitChange({
      type: documentChangeTypes[event.type],
      // The subscription carries no branch, so the documents are read as being
      // on the server's default branch - which is the only branch the
      // Switchboard pushes changes for today.
      documents: event.documents.map((document) =>
        phDocumentFromGetDocument(document),
      ),
      context: event.context
        ? {
            parentId: event.context.parentId ?? undefined,
            childId: event.context.childId ?? undefined,
          }
        : undefined,
    });
  }

  /**
   * Reports a broken realtime socket once per client, however many sockets it
   * goes through.
   *
   * `graphql-ws` retries on its own, and a Switchboard without a websocket
   * endpoint would otherwise fill the console for as long as the page is open.
   */
  private logRealtimeError(error: unknown): void {
    if (this.realtimeErrorLogged) {
      return;
    }
    this.realtimeErrorLogged = true;
    logger.warn(
      "GraphQLReactorClient: realtime document changes are unavailable, falling back to local change events",
      error,
    );
  }

  /**
   * Delivers an event to every matching subscriber.
   *
   * A subscriber that throws is logged and skipped so one bad listener cannot
   * stop the others from being notified.
   */
  private emitChange(event: DocumentChangeEvent): void {
    for (const listener of [...this.listeners]) {
      if (!eventMatchesSearch(event, listener.search)) {
        continue;
      }

      try {
        listener.callback(event);
      } catch (error) {
        logger.error(
          "GraphQLReactorClient: a document change subscriber threw",
          error,
        );
      }
    }
  }
}

/**
 * Whether a value is a {@link GraphQLReactorClient}, including one built by
 * another copy of this module.
 *
 * Use this rather than `instanceof`: the brand it tests for is shared by every
 * copy of the class, so a client built by a hot-replaced module or by a package
 * that bundled its own copy is still recognised.
 */
export function isGraphQLReactorClient(
  client: unknown,
): client is GraphQLReactorClient {
  return (
    (client as Partial<GraphQLReactorClient> | null | undefined)?.[
      graphQLReactorClientBrand
    ] === true
  );
}

/** The schema's change types, mapped onto the reactor's. */
const documentChangeTypes: Record<GqlDocumentChangeType, DocumentChangeType> = {
  [GqlDocumentChangeType.Created]: DOCUMENT_CHANGE_TYPE.Created,
  [GqlDocumentChangeType.Deleted]: DOCUMENT_CHANGE_TYPE.Deleted,
  [GqlDocumentChangeType.Updated]: DOCUMENT_CHANGE_TYPE.Updated,
  [GqlDocumentChangeType.ParentAdded]: DOCUMENT_CHANGE_TYPE.ParentAdded,
  [GqlDocumentChangeType.ParentRemoved]: DOCUMENT_CHANGE_TYPE.ParentRemoved,
  [GqlDocumentChangeType.ChildAdded]: DOCUMENT_CHANGE_TYPE.ChildAdded,
  [GqlDocumentChangeType.ChildRemoved]: DOCUMENT_CHANGE_TYPE.ChildRemoved,
};

/**
 * Decides whether an event reaches a subscriber.
 *
 * Every populated field of the search filter is an AND condition, matching the
 * reactor's own subscription manager - which also treats an empty array as a
 * filter that nothing satisfies. `parentId` is a drive concept and is ignored.
 *
 * A `Deleted` event carries no documents, so it is matched on its
 * `context.childId` for identifier filters and delivered unconditionally to
 * type and slug filters: there is no document left to check them against.
 */
function eventMatchesSearch(
  event: DocumentChangeEvent,
  search: SearchFilter,
): boolean {
  const deleted = event.type === DOCUMENT_CHANGE_TYPE.Deleted;
  const { ids, slugs, type } = search;

  if (ids) {
    const eventIds = deleted
      ? [event.context?.childId]
      : event.documents.map((document) => document.header.id);
    if (!eventIds.some((id) => id !== undefined && ids.includes(id))) {
      return false;
    }
  }

  if (slugs && !deleted) {
    const eventSlugs = event.documents.map((document) => document.header.slug);
    if (!eventSlugs.some((slug) => slugs.includes(slug))) {
      return false;
    }
  }

  if (type && !deleted) {
    const eventTypes = event.documents.map(
      (document) => document.header.documentType,
    );
    if (!eventTypes.includes(type)) {
      return false;
    }
  }

  return true;
}

/**
 * Maps a reactor `ViewFilter` onto the GraphQL `ViewFilterInput`.
 *
 * Point-in-time reads are rejected: the Switchboard read API has no revision
 * argument, so silently returning the head state would be wrong.
 */
export function viewFilterInputFromViewFilter(
  view?: ViewFilter,
): ViewFilterInput | undefined {
  if (!view) {
    return undefined;
  }

  if (view.revision !== undefined) {
    throw new Error(
      "point-in-time views are not supported by GraphQLReactorClient",
    );
  }

  if (view.branch === undefined && view.scopes === undefined) {
    return undefined;
  }

  return { branch: view.branch, scopes: view.scopes };
}

function pagingInputFromPaging(
  paging?: PagingOptions,
): PagingInput | undefined {
  if (!paging) {
    return undefined;
  }
  return { cursor: paging.cursor, limit: paging.limit };
}

/**
 * The reactor and the GraphQL schema disagree on the enum: the reactor's
 * `None` is the schema's `ORPHAN`. This is the inverse of the server's
 * `toReactorPropagationMode`.
 */
const propagationModeInputs: Record<PropagationMode, GqlPropagationMode> = {
  cascade: GqlPropagationMode.Cascade,
  none: GqlPropagationMode.Orphan,
};

function propagationModeInput(
  propagate?: PropagationMode,
): GqlPropagationMode | undefined {
  return propagate === undefined ? undefined : propagationModeInputs[propagate];
}

/**
 * Stamps and signs the actions about to be pushed.
 *
 * With no signer the actions go out exactly as given, batch or not - this
 * client does not require signatures. With one, every action is signed:
 * {@link prepareSignedActions} predicts the chain a batch will produce by
 * running the document's own reducer between signatures, which is why a batch
 * needs the module matching the document's type and exact version.
 *
 * A batch that cannot be predicted - no matching module, mixed scopes, an
 * action needing history - throws here, before the mutation. Sending it
 * unsigned instead would silently drop the signatures the caller asked for.
 */
async function prepareActionsForPush(
  actions: Action[],
  document: PHDocument,
  documentModels: readonly DocumentModelModule<any>[],
  explicitSigner: ISigner | undefined,
  signal?: AbortSignal,
): Promise<Action[]> {
  const signer = explicitSigner ?? resolveAmbientSigner();
  if (!signer || actions.length === 0) {
    return actions;
  }

  // Only a batch needs the reducer, and it needs the EXACT one the document was
  // written with - the same rule the server applies in `SimpleJobExecutor`.
  const module =
    actions.length > 1
      ? resolveDocumentModelModule(
          documentModels,
          document.header.documentType,
          documentModelVersion(document),
        )
      : undefined;

  return prepareSignedActions(actions, document, signer, module, signal);
}

/**
 * The document-model version the document's actions must be reduced with.
 *
 * `state` arrives as JSON over GraphQL, so its `document` scope is only as
 * reliable as the server that sent it - one written before that scope existed
 * carries no version at all. `normalizeDocumentModelVersion` maps that, and 0,
 * to 1: the same rule `SimpleJobExecutor` applies before asking the registry
 * for a module, so client and server cannot resolve different reducers.
 */
function documentModelVersion(document: PHDocument): number {
  const documentScope = document.state.document as PHDocumentState | undefined;
  return normalizeDocumentModelVersion(documentScope?.version);
}

/** Resolves the signer of the logged-in user, if there is one. */
function resolveAmbientSigner(): ISigner | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  const renown = window.ph?.renown;
  return renown?.user ? renown.signer : undefined;
}

/**
 * The revision the pushed operations start from: the lowest head revision
 * across the scopes the actions target.
 *
 * The baseline is only meaningful together with {@link scopesForActions}: a
 * batch that touches a scope at revision 1 and one at revision 5000 would
 * otherwise re-download the whole history of every scope of the document.
 */
function sinceRevisionForActions(
  document: PHDocument,
  actions: Action[],
): number {
  const revisions = actions.map(
    (action) => document.header.revision[action.scope] ?? 0,
  );
  return revisions.length > 0 ? Math.min(...revisions) : 0;
}

/** The distinct scopes the pushed actions target, in first-seen order. */
function scopesForActions(actions: Action[]): string[] | undefined {
  if (actions.length === 0) {
    return undefined;
  }
  return [...new Set(actions.map((action) => action.scope))];
}
