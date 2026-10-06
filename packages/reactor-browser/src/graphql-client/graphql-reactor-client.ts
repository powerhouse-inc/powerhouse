import type {
  BatchExecutionRequest,
  BatchExecutionResult,
  DocumentChangeEvent,
  DocumentChangeType,
  DocumentRelationship,
  ExecutionJobPlan,
  JobInfo,
  JobResultSummary,
  JobStatus,
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
  ProtocolVersions,
  SignaturePolicy,
} from "@powerhousedao/shared/document-model";
import {
  actions,
  actionSigningTarget,
  isSignaturePolicy,
  normalizeDocumentModelVersion,
  toTransportAction,
} from "@powerhousedao/shared/document-model";
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
  type DocumentRelationshipFieldsFragment,
  type GetCreateDefaultsQuery,
  type JobInfoFieldsFragment,
  type OperationsFilterInput,
  type PagingInput,
  type PhDocumentFieldsFragment,
  type SdkFunctionWrapper,
  type ViewFilterInput,
} from "../graphql/gen/schema.js";
import type { ReactorGraphQLClient } from "../graphql/types.js";
import { DRIVE_DOCUMENT_TYPES } from "../constants.js";
import { DOCUMENT_CHANGE_TYPE } from "../reactor-interop.js";
import { remoteOperationToLocal } from "../remote-controller/utils.js";
import type { IReactorBrowserClient } from "../types/reactor-browser-client.js";
import {
  isoStringFromDateTime,
  phDocumentFromGetDocument,
  phDocumentFromMutation,
} from "./adapter.js";
import {
  ambientRenownTokenProvider,
  makeAuthMiddleware,
  type BearerTokenProvider,
} from "./auth.js";
import {
  BatchJobFailedError,
  GraphQLOperationNotSupportedError,
  GraphQLWrongBackendError,
} from "./errors.js";
import {
  MutateDocumentWithOperationsDocument,
  type MutateDocumentWithOperationsResult,
  type MutateDocumentWithOperationsVariables,
} from "./operations.js";
import { prepareSignedActions, signStampedAction } from "./signing.js";
import { resolveDocumentModelModule } from "./static-package-manager.js";
import {
  describeGraphQLDocument,
  SubgraphSdkRegistry,
  type GraphQLRequestOptions,
  type SubgraphSdkFactory,
  type TypedGraphQLDocument,
} from "./subgraph.js";
import {
  isAuthRefusalClose,
  makeAuthConnectionParams,
  startDocumentChangesSubscription,
  subscriptionsUrlFromGraphqlUrl,
  type DocumentChangesEventPayload,
} from "./subscriptions.js";

/** A call the client asks {@link GraphQLReactorClientOptions.driveIdFor} about. */
export type DriveIdCall = {
  readonly method:
    | "create"
    | "execute"
    | "executeBatch"
    | "deleteDocument"
    | "find";
  readonly documentId?: string;
  readonly parentId?: string;
  readonly jobs?: readonly { readonly documentId: string }[];
};

export type GraphQLReactorClientOptions = {
  /** The Switchboard GraphQL endpoint, e.g. `http://localhost:4001/graphql`. */
  url: string;

  /**
   * A pre-built SDK to use instead of the transport derived from `url`.
   * Mainly a test seam.
   *
   * A client built this way carries no auth middleware and no 421 mapping:
   * the injected SDK owns its own transport, and therefore its own headers
   * and transport errors.
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

  /**
   * Names the drive a call belongs to when the client cannot prove it itself,
   * for its `Drive-Id` header; `undefined` sends none. Return only a drive id
   * the caller knows: a Switchboard that does not own it answers 421. Where
   * the client has proof of its own and the two disagree, the proof is sent.
   */
  driveIdFor?: (call: DriveIdCall) => string | undefined;
};

/** Paging defaults, matching the reactor's own client. */
const defaultPaging: PagingOptions = { cursor: "0", limit: 100 };

const JOB_POLL_INTERVAL_MS = 250;

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
  private readonly driveIdFor: GraphQLReactorClientOptions["driveIdFor"];
  private stopRealtime: (() => void) | undefined;
  private realtimeStarted = false;
  private realtimeGeneration = 0;
  private realtimeErrorLogged = false;
  /** Whether the last socket died because the Switchboard refused its credentials. */
  private realtimeRefusedCredentials = false;

  constructor(options: GraphQLReactorClientOptions) {
    this.tokenProvider = options.tokenProvider ?? ambientRenownTokenProvider;
    // Copied, not held: the caller's array must not be able to change which
    // reducer a later batch is signed with.
    this.documentModels = [...(options.documentModels ?? [])];
    this.signer = options.signer;
    this.driveIdFor = options.driveIdFor;
    this.subscriptionsUrl =
      options.realtime === false
        ? undefined
        : (options.subscriptionsUrl ??
          subscriptionsUrlFromGraphqlUrl(options.url));

    // The middleware wraps the generated SDK methods AND `RunDocument`, so the
    // hand-authored mutation is authenticated by the same code path.
    const middleware = withWrongBackendErrors(
      makeAuthMiddleware(this.tokenProvider),
    );
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

  /**
   * Whether the Switchboard would serve the document to this client's caller,
   * from its `documentServed` query: the same read gate `find` passes. Absent
   * or withheld is `false`; a failure to decide throws.
   *
   * A point-in-time view throws {@link GraphQLOperationNotSupportedError}, as
   * does a Switchboard without the query.
   */
  async isServed(
    identifier: string,
    view?: ViewFilter,
    signal?: AbortSignal,
  ): Promise<boolean> {
    const viewInput = viewFilterInputFromViewFilter(view);
    try {
      const result = await this.sdk.GetDocumentServed(
        { idOrSlug: identifier, view: viewInput },
        undefined,
        signal,
      );
      return result.documentServed;
    } catch (error) {
      if (queriesUnknownField(error, "documentServed")) {
        throw new GraphQLOperationNotSupportedError(
          "isServed",
          "the Switchboard predates the documentServed query",
        );
      }
      throw error;
    }
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

  /**
   * Filters documents by criteria over the Switchboard's `findDocuments` query.
   *
   * The query filters by `type` and `parentId` only, at head. A search naming
   * `ids` or `slugs` (present, whatever its length) and a point-in-time view are
   * each by-contract limitations the query cannot express -- running it anyway
   * would return every document instead of the named ones, or head instead of
   * the asked-for revision, a silently wrong answer. {@link findIsServableOverGraphQL}
   * is the single predicate that decides this, and an unservable `find` throws
   * {@link GraphQLOperationNotSupportedError}. Drive enumeration itself filters
   * by `type` at head, which is served.
   */
  async find<TDocument extends PHDocument = PHDocument>(
    search: SearchFilter,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<TDocument>> {
    if (!findIsServableOverGraphQL(search, view)) {
      throw new GraphQLOperationNotSupportedError(
        "find",
        searchNamesIdentifiers(search)
          ? "it cannot filter by ids or slugs: the Switchboard findDocuments query filters only by type and parentId"
          : "point-in-time views are not supported by GraphQLReactorClient",
      );
    }

    const viewInput = viewFilterInputFromViewFilter(view);
    const effectivePaging = paging ?? defaultPaging;
    const result = await this.sdk.FindDocuments(
      {
        search: { type: search.type, parentId: search.parentId },
        view: viewInput,
        paging: pagingInputFromPaging(effectivePaging),
      },
      search.parentId === undefined
        ? undefined
        : this.driveIdHeaders({ method: "find", parentId: search.parentId }),
      signal,
    );

    return this.toDocumentResults<TDocument>(
      result.findDocuments,
      effectivePaging,
      view?.branch,
      (cursor, limit) =>
        this.find<TDocument>(search, view, { cursor, limit }, signal),
    );
  }

  async getOutgoingRelationships(
    sourceIdentifier: string,
    relationshipType: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<PHDocument>> {
    const viewInput = viewFilterInputFromViewFilter(view);
    const result = await this.sdk.GetDocumentOutgoingRelationships(
      {
        sourceIdentifier,
        relationshipType,
        view: viewInput,
        paging: pagingInputFromPaging(paging),
      },
      undefined,
      signal,
    );

    return this.toDocumentResults(
      result.documentOutgoingRelationships,
      paging ?? defaultPaging,
      view?.branch,
      (cursor, limit) =>
        this.getOutgoingRelationships(
          sourceIdentifier,
          relationshipType,
          view,
          { cursor, limit },
          signal,
        ),
    );
  }

  async getIncomingRelationships(
    targetIdentifier: string,
    relationshipType: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<PHDocument>> {
    const viewInput = viewFilterInputFromViewFilter(view);
    const result = await this.sdk.GetDocumentIncomingRelationships(
      {
        targetIdentifier,
        relationshipType,
        view: viewInput,
        paging: pagingInputFromPaging(paging),
      },
      undefined,
      signal,
    );

    return this.toDocumentResults(
      result.documentIncomingRelationships,
      paging ?? defaultPaging,
      view?.branch,
      (cursor, limit) =>
        this.getIncomingRelationships(
          targetIdentifier,
          relationshipType,
          view,
          { cursor, limit },
          signal,
        ),
    );
  }

  async getOutgoingRelationshipEdges(
    sourceIdentifier: string,
    relationshipType?: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<DocumentRelationship>> {
    const viewInput = viewFilterInputFromViewFilter(view);
    const result = await this.sdk.GetDocumentOutgoingRelationshipEdges(
      {
        sourceIdentifier,
        relationshipType,
        view: viewInput,
        paging: pagingInputFromPaging(paging),
      },
      undefined,
      signal,
    );

    return this.toRelationshipResults(
      result.documentOutgoingRelationshipEdges,
      paging ?? defaultPaging,
      (cursor, limit) =>
        this.getOutgoingRelationshipEdges(
          sourceIdentifier,
          relationshipType,
          view,
          { cursor, limit },
          signal,
        ),
    );
  }

  async getIncomingRelationshipEdges(
    targetIdentifier: string,
    relationshipType?: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<DocumentRelationship>> {
    const viewInput = viewFilterInputFromViewFilter(view);
    const result = await this.sdk.GetDocumentIncomingRelationshipEdges(
      {
        targetIdentifier,
        relationshipType,
        view: viewInput,
        paging: pagingInputFromPaging(paging),
      },
      undefined,
      signal,
    );

    return this.toRelationshipResults(
      result.documentIncomingRelationshipEdges,
      paging ?? defaultPaging,
      (cursor, limit) =>
        this.getIncomingRelationshipEdges(
          targetIdentifier,
          relationshipType,
          view,
          { cursor, limit },
          signal,
        ),
    );
  }

  async create<TDocument extends PHDocument = PHDocument>(
    document: PHDocument,
    parentIdentifier?: string,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    // A new drive is pinned to the backend its own id routes to.
    const result = await this.sdk.CreateDocument(
      { document, parentIdentifier },
      this.driveIdHeaders(
        {
          method: "create",
          documentId: document.header.id || undefined,
          parentId: parentIdentifier,
        },
        isDrive(document) ? document.header.id : undefined,
      ),
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
   *
   * `IReactorClient.execute`'s trailing `subject` is deliberately not accepted
   * here. It names the subject a local read gate answers as, and this client
   * runs no gate: the Switchboard decides what to serve from the bearer on the
   * request. Declaring it would suggest a per-call choice that does not exist.
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
      // Projected onto the fields the schema declares, so a stamped or signed
      // action does not carry a field the input rejects the whole request for.
      actions: preparedActions.map(toTransportAction),
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
        requestHeaders: this.driveIdHeaders(
          { method: "execute", documentId: documentIdentifier },
          isDrive(document) ? document.header.id : undefined,
        ),
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
   * Runs multiple mutation jobs in dependency order over the Switchboard's
   * `executeBatch` mutation and waits for all to settle, returning the result
   * shaped like `IReactor.executeBatch`'s so the reference `DriveClient`
   * consumes it unchanged.
   *
   * Not atomic: each job commits on its own and a failed job still releases
   * its dependents. A FAILED job throws {@link BatchJobFailedError}, naming the
   * first failed plan key and carrying every job's final state.
   *
   * Each job's actions are signed independently for the job's own
   * `(documentId, branch)` target -- the per-action signing the reactor's own
   * `signActions` does, not the batch state-prediction `execute` uses for a
   * multi-action push. A drive job such as `addFile`'s is `CREATE_DOCUMENT` +
   * `UPGRADE_DOCUMENT` + `ADD_RELATIONSHIP`, which the prediction path rejects
   * outright and which has no fetchable baseline to stamp against. The reactor
   * records but does not verify the stamped previous-state head, so signing
   * each action bare is exactly what the in-process `DriveClient` relies on.
   *
   * The mutation is synchronous server-side: a job it returns is already
   * settled, so {@link waitForJob} resolves from it without polling.
   */
  async executeBatch(
    request: BatchExecutionRequest,
    signal?: AbortSignal,
  ): Promise<BatchExecutionResult> {
    const signer = this.signer ?? resolveAmbientSigner();
    const jobInputs = await Promise.all(
      request.jobs.map(async (job, index) => {
        const documentId = await this.batchWriteTarget(
          job,
          request.jobs.slice(0, index),
          signer,
          signal,
        );
        const actions = await this.signBatchJobActions(
          { ...job, documentId },
          signer,
          signal,
        );
        return {
          key: job.key,
          documentIdOrSlug: documentId,
          scope: job.scope,
          branch: job.branch,
          actions: actions.map(toTransportAction),
          dependsOn: job.dependsOn,
        };
      }),
    );

    const result = await this.sdk.ExecuteBatch(
      { jobs: jobInputs },
      this.driveIdHeaders({
        method: "executeBatch",
        jobs: jobInputs.map((job) => ({ documentId: job.documentIdOrSlug })),
      }),
      signal,
    );

    const jobs: Record<string, JobInfo> = {};
    for (const entry of result.executeBatch.jobs) {
      jobs[entry.key] = jobInfoFromGql(entry.job);
    }
    await this.announceBatch(request, jobs, signal);
    const failed = request.jobs.find(
      (job) => (jobs[job.key]?.status as string | undefined) === "FAILED",
    );
    if (failed) {
      throw new BatchJobFailedError(failed.key, jobs);
    }
    return { jobs };
  }

  /** Polls `jobStatus` until the job is READ_READY or FAILED. */
  async waitForJob(
    jobOrId: string | JobInfo,
    signal?: AbortSignal,
  ): Promise<JobInfo> {
    if (typeof jobOrId !== "string" && isSettled(jobOrId)) {
      return jobOrId;
    }
    const jobId = typeof jobOrId === "string" ? jobOrId : jobOrId.id;
    for (;;) {
      const result = await this.sdk.GetJobStatus({ jobId }, undefined, signal);
      if (!result.jobStatus) {
        throw new Error(`Job not found: ${jobId}`);
      }
      const job = jobInfoFromGql(result.jobStatus);
      if (isSettled(job)) {
        return job;
      }
      await delay(JOB_POLL_INTERVAL_MS, signal);
    }
  }

  /**
   * The policy the Switchboard gives a new document, read from its
   * `createDefaults` query. A Switchboard without that query is refused with
   * {@link GraphQLOperationNotSupportedError}: a guessed default would
   * under-sign on a stricter host.
   */
  async getCreateSignaturePolicy(): Promise<SignaturePolicy> {
    const defaults = await this.createDefaults("getCreateSignaturePolicy");
    return defaults.signaturePolicy;
  }

  /**
   * The protocol versions the Switchboard selects for a new document under
   * `parentIdentifier`, read from its `createDefaults` query. A parent the
   * caller may not read is refused by the server, never answered as if none
   * was named; a Switchboard without the query is refused with
   * {@link GraphQLOperationNotSupportedError}.
   */
  async getCreateProtocolVersions(
    parentIdentifier?: string,
    signal?: AbortSignal,
  ): Promise<ProtocolVersions> {
    const defaults = await this.createDefaults(
      "getCreateProtocolVersions",
      parentIdentifier,
      signal,
    );
    return defaults.protocolVersions;
  }

  private async createDefaults(
    operation: string,
    parentIdOrSlug?: string,
    signal?: AbortSignal,
  ): Promise<{
    signaturePolicy: SignaturePolicy;
    protocolVersions: ProtocolVersions;
  }> {
    let result: GetCreateDefaultsQuery;
    try {
      result = await this.sdk.GetCreateDefaults(
        { parentIdOrSlug },
        undefined,
        signal,
      );
    } catch (error) {
      if (queriesUnknownField(error, "createDefaults")) {
        throw new GraphQLOperationNotSupportedError(
          operation,
          "the Switchboard predates the createDefaults query",
        );
      }
      throw error;
    }
    const { signaturePolicy, protocolVersions } = result.createDefaults;
    if (!isSignaturePolicy(signaturePolicy)) {
      throw new Error(
        `The Switchboard answered an unknown create signature policy: ${signaturePolicy}`,
      );
    }
    return {
      signaturePolicy,
      protocolVersions: protocolVersionsFrom(protocolVersions),
    };
  }

  /**
   * Sets or, with `null`, clears the preferred editor as a client-signed
   * action, as the in-process client does.
   */
  setPreferredEditor(
    documentIdentifier: string,
    preferredEditor: string | null,
    branch: string = "main",
    signal?: AbortSignal,
  ): Promise<PHDocument> {
    return this.execute(
      documentIdentifier,
      branch,
      [actions.setPreferredEditor(preferredEditor)],
      signal,
    );
  }

  /** The `Drive-Id` header for a call: the client's own proof, else the hook's. */
  private driveIdHeaders(
    call: DriveIdCall,
    proven?: string,
  ): Record<string, string> | undefined {
    const hinted = this.driveIdFor?.(call);
    if (proven) {
      if (hinted && hinted !== proven) {
        logger.warn(
          "GraphQLReactorClient: driveIdFor named @hinted for @method, which belongs to drive @proven; sending the proven drive",
          hinted,
          call.method,
          proven,
        );
      }
      return driveIdHeaders(proven);
    }
    return hinted ? driveIdHeaders(hinted) : undefined;
  }

  /**
   * Emits the changes the batch's settled jobs made, as `create` and `execute`
   * do, so a cache is invalidated without a realtime socket. The documents a
   * job wrote to are its own and those its consistency token names.
   */
  private async announceBatch(
    request: BatchExecutionRequest,
    jobs: Record<string, JobInfo>,
    signal?: AbortSignal,
  ): Promise<void> {
    if (this.listeners.length === 0) {
      return;
    }
    type Written = { documentId: string; branch: string };
    const deleted = new Set<string>();
    const created = new Map<string, Written>();
    const touched = new Map<string, Written>();
    const keyOf = (written: Written) =>
      `${written.branch}\u0000${written.documentId}`;
    for (const job of request.jobs) {
      const info = jobs[job.key] as JobInfo | undefined;
      if (!info || (info.status as string) !== "READ_READY") continue;
      const types = new Set(job.actions.map((action) => action.type));
      if (types.has("DELETE_DOCUMENT")) {
        deleted.add(info.documentId);
        continue;
      }
      const own = { documentId: info.documentId, branch: job.branch };
      if (types.has("CREATE_DOCUMENT")) {
        created.set(keyOf(own), own);
      }
      touched.set(keyOf(own), own);
      for (const { documentId, branch } of info.consistencyToken.coordinates) {
        touched.set(keyOf({ documentId, branch }), { documentId, branch });
      }
    }

    for (const documentId of deleted) {
      this.emitChange({
        type: DOCUMENT_CHANGE_TYPE.Deleted,
        documents: [],
        context: { childId: documentId },
      });
    }

    const read = async ({ documentId, branch }: Written) => {
      try {
        return await this.get(documentId, { branch }, signal);
      } catch (error) {
        logger.warn(
          "GraphQLReactorClient: could not read @documentId on @branch to announce a batch change: @error",
          documentId,
          branch,
          error,
        );
        return undefined;
      }
    };
    const readAll = async (written: Written[]) =>
      (await Promise.all(written.map(read))).filter(
        (document) => document !== undefined,
      );
    // Read concurrently, emit in order: Created before Updated.
    const [createdDocuments, updatedDocuments] = await Promise.all([
      readAll([...created.values()].filter((w) => !deleted.has(w.documentId))),
      readAll(
        [...touched.entries()]
          .filter(([key, w]) => !deleted.has(w.documentId) && !created.has(key))
          .map(([, w]) => w),
      ),
    ]);
    if (createdDocuments.length > 0) {
      this.emitChange({
        type: DOCUMENT_CHANGE_TYPE.Created,
        documents: createdDocuments,
      });
    }
    if (updatedDocuments.length > 0) {
      this.emitChange({
        type: DOCUMENT_CHANGE_TYPE.Updated,
        documents: updatedDocuments,
      });
    }
  }

  /**
   * The id a job's actions are signed for: a signature covers the document id,
   * and the server resolves a slug before verifying. A document created by this
   * job or an earlier one is named by its id. When the server has no such
   * document the identifier is used as given, and the server decides; any
   * other failure to read it throws, so nothing is signed for a slug.
   */
  private async batchWriteTarget(
    job: ExecutionJobPlan,
    earlier: readonly ExecutionJobPlan[],
    signer: ISigner | undefined,
    signal?: AbortSignal,
  ): Promise<string> {
    const creates = (plan: ExecutionJobPlan) =>
      plan.documentId === job.documentId &&
      plan.actions.some((action) => action.type === "CREATE_DOCUMENT");
    if (
      !signer ||
      job.actions.every(isActionSigned) ||
      creates(job) ||
      earlier.some(creates)
    ) {
      return job.documentId;
    }
    const result = await this.sdk.GetDocument(
      {
        identifier: job.documentId,
        view: viewFilterInputFromViewFilter({ branch: job.branch }),
      },
      undefined,
      signal,
    );
    return result.document?.document.id ?? job.documentId;
  }

  /**
   * Signs one batch job's actions for the job's own log.
   *
   * Each action is signed on its own for `(documentId, branch)`, the same
   * per-action signing the reactor's `signActions` does: no state prediction
   * across the job, so a job carrying a `CREATE_DOCUMENT` the push-prediction
   * path rejects still signs. An action already signed under a key is left
   * as it is: the reference `DriveClient` signs its jobs before handing them
   * here. With no signer the actions pass through unsigned, matching
   * {@link execute}.
   */
  private async signBatchJobActions(
    job: ExecutionJobPlan,
    signer: ISigner | undefined,
    signal?: AbortSignal,
  ): Promise<Action[]> {
    if (!signer) {
      return job.actions;
    }
    return Promise.all(
      job.actions.map((action) =>
        isActionSigned(action)
          ? Promise.resolve(action)
          : signStampedAction(
              action,
              signer,
              actionSigningTarget(action, job.documentId, job.branch),
              signal,
            ),
      ),
    );
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
      this.driveIdHeaders({ method: "deleteDocument", documentId: identifier }),
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
   * Shapes a document result page into the reactor's {@link PagedResults}.
   *
   * The items carry the same `PHDocumentFields` fragment as `get`, so the same
   * adapter rebuilds each one. `hasNextPage` gates the cursor exactly as
   * `getOperations` does: no cursor means no `next`.
   */
  private toDocumentResults<TDocument extends PHDocument = PHDocument>(
    page: {
      items: ReadonlyArray<PhDocumentFieldsFragment>;
      hasNextPage: boolean;
      cursor?: string | null;
    },
    effectivePaging: PagingOptions,
    branch: string | undefined,
    next: (cursor: string, limit: number) => Promise<PagedResults<TDocument>>,
  ): PagedResults<TDocument> {
    const nextCursor = page.hasNextPage
      ? (page.cursor ?? undefined)
      : undefined;
    return {
      results: page.items.map((item) =>
        phDocumentFromGetDocument<TDocument>(item, branch),
      ),
      options: effectivePaging,
      nextCursor,
      next: nextCursor
        ? () => next(nextCursor, effectivePaging.limit)
        : undefined,
    };
  }

  /**
   * Shapes a relationship-edge result page into the reactor's
   * {@link PagedResults}, restoring each edge's `Date` fields.
   */
  private toRelationshipResults(
    page: {
      items: ReadonlyArray<DocumentRelationshipFieldsFragment>;
      hasNextPage: boolean;
      cursor?: string | null;
    },
    effectivePaging: PagingOptions,
    next: (
      cursor: string,
      limit: number,
    ) => Promise<PagedResults<DocumentRelationship>>,
  ): PagedResults<DocumentRelationship> {
    const nextCursor = page.hasNextPage
      ? (page.cursor ?? undefined)
      : undefined;
    return {
      results: page.items.map((edge) => documentRelationshipFromEdge(edge)),
      options: effectivePaging,
      nextCursor,
      next: nextCursor
        ? () => next(nextCursor, effectivePaging.limit)
        : undefined,
    };
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
   * or once the Switchboard refused the credentials the socket carried - which
   * `shouldRetry` declines to retry at all. Keeping the dead stop function
   * would make every later `subscribe` a no-op, so realtime would stay off for
   * the life of the page even after the user signs in.
   *
   * Why it died is recorded: a refusal is undone by a credential change and
   * nothing else, and {@link notifyCredentialsChanged} acts only on that.
   *
   * The generation stamp discards a report from a socket that has already been
   * replaced or disposed.
   */
  private handleRealtimeFailure(generation: number, error: unknown): void {
    if (generation !== this.realtimeGeneration) {
      return;
    }
    this.teardownRealtime();
    this.realtimeRefusedCredentials = isAuthRefusalClose(error);
    this.logRealtimeError(error);
  }

  /**
   * Reopens realtime after a sign-in, a sign-out or a token swap.
   *
   * Call it whenever the credentials this client authenticates with change.
   *
   * A live socket is replaced. `connectionParams` are resolved once, when the
   * socket opens, so a socket keeps presenting the credentials it was opened
   * with until something closes it - and a sign-out closes nothing. That left
   * a signed-out tab still receiving the previous identity's document changes,
   * on a shared machine, for as long as the socket happened to survive.
   *
   * A refused socket is reopened, for the same reason from the other side:
   * otherwise it stays closed until an unrelated component happens to
   * `subscribe`, so signing in leaves realtime off with nothing said - the
   * state `handleRealtimeFailure` resets to avoid.
   *
   * A socket that died for any other reason is left alone: a network failure
   * is not something a new token fixes, and reopening one here would turn a
   * credential change into a reconnect loop.
   */
  notifyCredentialsChanged(): void {
    if (!this.realtimeStarted && !this.realtimeRefusedCredentials) {
      return;
    }
    // Drops the old socket, and with it the old credentials, before any new
    // one opens. `teardownRealtime` clears the refusal flag too.
    this.teardownRealtime();
    if (this.listeners.length === 0) {
      // Nobody to deliver to. The next `subscribe` opens a socket anyway.
      return;
    }
    this.startRealtime();
  }

  /** Closes the socket and lets a later subscriber open a new one. */
  private teardownRealtime(): void {
    this.realtimeGeneration += 1;
    this.realtimeStarted = false;
    this.realtimeRefusedCredentials = false;
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

  if (viewIsPointInTime(view)) {
    throw new GraphQLOperationNotSupportedError(
      "view",
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
 * Whether a search names `ids` or `slugs`, which the Switchboard `findDocuments`
 * query cannot honour (it filters by `type` and `parentId`).
 *
 * The test is PRESENCE, not length: the reactor `find` contract
 * (`packages/reactor/src/core/reactor.ts`) dispatches on `search.ids` /
 * `search.slugs` being present, so `find({ ids: [] })` is an identifier search
 * that must yield the empty set -- not a plain type query over every document.
 * The GraphQL surface cannot express an identifier search at all, so a present
 * (even empty) `ids`/`slugs` is refused rather than served as the wrong query.
 */
function searchNamesIdentifiers(search: SearchFilter): boolean {
  return search.ids !== undefined || search.slugs !== undefined;
}

/** Whether a view asks for a point-in-time read the GraphQL surface cannot express. */
function viewIsPointInTime(view?: ViewFilter): boolean {
  return view?.revision !== undefined;
}

/**
 * The single source of truth for whether the Switchboard `findDocuments` query
 * can serve a `find`. It is servable iff the search names neither `ids` nor
 * `slugs` (present, regardless of length) AND the view is not point-in-time:
 * each is a by-contract limitation of a surface that filters only by
 * `type`/`parentId` at head. Exported so a caller can route around an
 * unservable search instead of catching the error `find` throws for it.
 */
export function findIsServableOverGraphQL(
  search: SearchFilter,
  view?: ViewFilter,
): boolean {
  return !searchNamesIdentifiers(search) && !viewIsPointInTime(view);
}

/** Rebuilds a relationship edge from its GraphQL fields. */
function documentRelationshipFromEdge(
  edge: DocumentRelationshipFieldsFragment,
): DocumentRelationship {
  const relationship: DocumentRelationship = {
    sourceId: edge.sourceId,
    targetId: edge.targetId,
    relationshipType: edge.relationshipType,
    createdAt: dateFromDateTime(edge.createdAt),
    updatedAt: dateFromDateTime(edge.updatedAt),
  };
  const metadata = edge.metadata;
  if (isPlainObject(metadata)) {
    relationship.metadata = metadata;
  }
  return relationship;
}

/**
 * Restores a `Date` from the `DateTime` scalar, which deserializes as either an
 * ISO string or a `Date`, reusing the get-path's {@link isoStringFromDateTime}.
 *
 * A null, absent or unparseable value is a malformed timestamp from the server,
 * not something to coerce to the epoch or an `Invalid Date`: it throws, so the
 * malformed edge surfaces as a genuine failure rather than a silently-wrong
 * `DocumentRelationship`.
 */
function dateFromDateTime(value: string | Date | null | undefined): Date {
  if (value === null || value === undefined) {
    throw new Error(
      "relationship edge is missing a required DateTime timestamp",
    );
  }
  const date = new Date(isoStringFromDateTime(value));
  if (Number.isNaN(date.getTime())) {
    throw new Error(
      `relationship edge carries an unparseable DateTime timestamp: ${String(value)}`,
    );
  }
  return date;
}

/**
 * Whether a JSON value is a plain object, so relationship `metadata` is assigned
 * only when it is one. A non-object JSON scalar (string, number, array, null)
 * is dropped exactly as a null is, rather than cast to `Record` and trusted.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

/**
 * Rebuilds a reactor {@link JobInfo} from what the server reported. An unknown
 * job arrives as the reactor's own: FAILED with an empty `documentId`.
 */
function jobInfoFromGql(job: JobInfoFieldsFragment): JobInfo {
  const token = job.consistencyToken;
  if (token.version !== 1) {
    throw new Error(
      `Job ${job.id} carries consistency token version ${token.version}, which this client cannot read`,
    );
  }
  const info: JobInfo = {
    id: job.id,
    documentId: job.documentId,
    status: job.status as JobStatus,
    createdAtUtcIso: isoStringFromDateTime(job.createdAt),
    consistencyToken: {
      version: 1,
      createdAtUtcIso: token.createdAtUtcIso,
      coordinates: token.coordinates.map((coordinate) => ({ ...coordinate })),
    },
    meta: {
      batchId: job.meta.batchId,
      batchJobIds: [...job.meta.batchJobIds],
    },
  };
  if (job.completedAt != null) {
    info.completedAtUtcIso = isoStringFromDateTime(job.completedAt);
  }
  if (job.result != null) {
    info.result = job.result as JobResultSummary;
  }
  if (job.error != null) {
    // The server keeps stacks to itself; a message always comes with its name.
    info.error = {
      name: job.errorName ?? "Error",
      message: job.error,
      stack: "",
    };
  }
  return info;
}

/**
 * Whether a request failed because the server's schema has no such root field:
 * a Switchboard older than the field. graphql-js validation words this the same
 * under every gateway the Switchboard can run.
 */
function queriesUnknownField(error: unknown, field: string): boolean {
  const errors = (error as { response?: { errors?: unknown } } | null)?.response
    ?.errors;
  if (!Array.isArray(errors)) {
    return false;
  }
  const prefix = `Cannot query field "${field}" on type "`;
  return errors.some(
    (entry) =>
      typeof (entry as { message?: unknown } | null)?.message === "string" &&
      (entry as { message: string }).message.startsWith(prefix),
  );
}

/**
 * The header a Switchboard's drive middleware and load balancer key on. A
 * request carries it only when it is known to belong to that one drive: the
 * server answers any drive it does not own with 421.
 */
const DRIVE_ID_HEADER = "Drive-Id";

function driveIdHeaders(driveId: string): Record<string, string> | undefined {
  return driveId === "" ? undefined : { [DRIVE_ID_HEADER]: driveId };
}

function isDrive(document: PHDocument): boolean {
  return (DRIVE_DOCUMENT_TYPES as readonly string[]).includes(
    document.header.documentType,
  );
}

/**
 * Surfaces a 421 from the Switchboard's drive middleware, which graphql-request
 * reports as a `ClientError`, as {@link GraphQLWrongBackendError}.
 */
function withWrongBackendErrors(
  middleware: SdkFunctionWrapper,
): SdkFunctionWrapper {
  return async (action, ...rest) => {
    try {
      return await middleware(action, ...rest);
    } catch (error) {
      throw wrongBackendErrorOf(error) ?? error;
    }
  };
}

function wrongBackendErrorOf(
  error: unknown,
): GraphQLWrongBackendError | undefined {
  const response = (
    error as {
      response?: { status?: unknown; body?: unknown; [key: string]: unknown };
    } | null
  )?.response;
  if (response?.status !== 421) {
    return undefined;
  }
  let payload: unknown = response.body;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      // Not JSON: kept as the text the server sent.
    }
  }
  const driveId = (payload as { driveId?: unknown } | null)?.driveId;
  return new GraphQLWrongBackendError(
    typeof driveId === "string" ? driveId : "",
    payload,
    { cause: error },
  );
}

/** Protocol versions as the server sent them; anything but a version map throws. */
function protocolVersionsFrom(value: unknown): ProtocolVersions {
  if (!isPlainObject(value)) {
    throw new Error(
      "The Switchboard answered malformed create protocol versions",
    );
  }
  const versions: ProtocolVersions = {};
  for (const [protocol, version] of Object.entries(value)) {
    if (typeof version !== "number" || !Number.isInteger(version)) {
      throw new Error(
        `The Switchboard answered a malformed version for protocol ${protocol}`,
      );
    }
    versions[protocol] = version;
  }
  return versions;
}

function isSettled(job: JobInfo): boolean {
  const status: string = job.status;
  return status === "READ_READY" || status === "FAILED";
}

function abortReason(signal: AbortSignal): Error {
  const reason: unknown = signal.reason;
  return reason instanceof Error ? reason : new Error(String(reason));
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortReason(signal));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      if (signal) reject(abortReason(signal));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** As the reactor's `signAction` reads it: the last tuple names a key. */
function isActionSigned(action: Action): boolean {
  const signer = action.context?.signer;
  return Boolean(signer?.app?.key && signer.signatures.at(-1)?.[1]);
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
