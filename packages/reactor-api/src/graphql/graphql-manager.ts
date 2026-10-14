import type { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import type {
  IDriveClient,
  IReactorClient,
  IRelationalDb,
  ISyncManager,
  SyncScopeGate,
} from "@powerhousedao/reactor";
import type {
  Context,
  ISubgraph,
  SubgraphClass,
} from "@powerhousedao/reactor-api";
import type { DocumentDriveDocument } from "@powerhousedao/shared/document-drive";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";
import {
  type DocumentNode,
  type GraphQLSchema,
  Kind,
  print,
  visit,
} from "graphql";
import type { IncomingHttpHeaders } from "http";
import { AsyncLocalStorage } from "node:async_hooks";
import type http from "node:http";
import path from "node:path";
import { match } from "path-to-regexp";
import type { WebSocketServer } from "ws";
import {
  CORE_PACKAGE_NAME,
  HttpRouteService,
  type IHttpScope,
} from "../http/index.js";
import { debounce } from "../packages/util.js";
import {
  reportFailure,
  runDetached,
  type ReportError,
  type RunDetachedOptions,
} from "../utils/detached.js";
import {
  createCredentialInvalidator,
  type AuthService,
  type User,
} from "../services/auth.service.js";
import type { IAttachmentClientProvider } from "../services/authorized-attachment.service.js";
import type {
  CanonicalDocumentId,
  IAuthorizationService,
} from "../services/authorization.service.js";
import type { DocumentPermissionService } from "../services/document-permission.service.js";
import {
  buildDocumentModelSchema,
  buildSubgraphSchemaModule,
  createSchema,
  type DocumentModelSchema,
  DocumentModelSchemaCache,
  findSubgraphTypeCollisions,
  type GeneratedDocumentModelTypes,
  getGeneratedDocumentModelTypes,
  type ReservedTypeNames,
  reservedTypeNames,
  reservedTypeNamesTaken,
  type SubgraphSchemaOptions,
  SubgraphTypeCollisionError,
  typeDefinitionNames,
} from "../utils/create-schema.js";
import { callerSubject } from "./base-subgraph.js";
import type { IReactorInspectionSource } from "./inspection/source.js";
import { DocumentModelSubgraph } from "./document-model-subgraph.js";
import {
  collectSubgraphClaims,
  describeOwnershipConflicts,
  resolveClaimOwnership,
  type SubgraphClaims,
} from "./subgraph-type-ownership.js";
import { filterBuildableSubgraphs } from "./gateway/adapter-gateway-stitching.js";
import {
  getAuthContext,
  type AuthFetchMiddleware,
} from "./gateway/auth-middleware.js";
import {
  createDriveFetchMiddleware,
  getRequestDriveId,
  type DriveFetchMiddleware,
} from "./gateway/drive-middleware.js";
import {
  DriveOwnershipCache,
  type DriveStore,
} from "./gateway/drive-ownership-cache.js";
import type { RequireAuthFetchMiddleware } from "./gateway/require-auth-middleware.js";
import {
  DEFAULT_WS_CREDENTIAL_RECHECK_INTERVAL_MS,
  WsCredentialMonitor,
} from "./ws-credential-monitor.js";
import {
  WS_CLOSE_REASON_AUTHENTICATION_REQUIRED,
  WS_CLOSE_REASON_BEARER_REJECTED,
  type FetchHandler,
  type GatewayContextFactory,
  type IGatewayAdapter,
  type IHttpAdapter,
  type AdapterRouteHandle,
  type SubgraphDefinition,
  type WsConnection,
  type WsDisposer,
  type WsHandlers,
} from "./gateway/types.js";
import {
  createGraphQLSSEHandler,
  mergeStreamSubgraphs,
  withoutFederationDirectives,
} from "./sse.js";

const DOCUMENT_MODELS_TO_EXCLUDE: string[] = [];

const NON_MODEL_TYPE_NAMES = new Set([
  "String",
  "Int",
  "Float",
  "Boolean",
  "ID",
  "Query",
  "Mutation",
  "Subscription",
]);

/**
 * Filter document models to keep only the latest version of each unique document model.
 */
function filterLatestDocumentModelVersions(
  documentModels: DocumentModelModule[],
): DocumentModelModule[] {
  const latestByName = new Map<string, DocumentModelModule>();

  for (const documentModel of documentModels) {
    const name = documentModel.documentModel.global.name;
    const existing = latestByName.get(name);

    if (!existing) {
      latestByName.set(name, documentModel);
      continue;
    }

    const currentVersion =
      documentModel.version ??
      documentModel.documentModel.global.specifications.at(-1)?.version ??
      0;
    const existingVersion =
      existing.version ??
      existing.documentModel.global.specifications.at(-1)?.version ??
      0;

    if (currentVersion > existingVersion) {
      latestByName.set(name, documentModel);
    }
  }

  return Array.from(latestByName.values());
}

const DefaultFeatureFlags = {
  enableDocumentModelSubgraphs: true,
};

export type GraphqlManagerFeatureFlags = {
  enableDocumentModelSubgraphs?: boolean;
};

/** Dependencies and settings for a {@link GraphQLManager}. */
export type GraphQLManagerOptions = {
  path: string;
  httpServer: http.Server;
  wsServer: WebSocketServer;
  reactorClient: IReactorClient;
  relationalDb: IRelationalDb;
  analyticsStore: IAnalyticsStore;
  syncManager: ISyncManager;
  logger: ILogger;
  httpAdapter: IHttpAdapter;
  gatewayAdapter: IGatewayAdapter<Context>;
  authService?: AuthService;
  documentPermissionService?: DocumentPermissionService;
  /** Defaults to every flag on. */
  featureFlags?: GraphqlManagerFeatureFlags;
  /** Defaults to 4001. */
  port?: number;
  authorizationService: IAuthorizationService;
  /** Resolvers dispatch to it for reactor-drive parents. */
  reactorDriveClient?: IDriveClient;
  syncServingGate?: SyncScopeGate;
  httpRoutes?: HttpRouteService;
  attachments?: IAttachmentClientProvider;
  inspection?: IReactorInspectionSource;
  /**
   * Where drive ownership is looked up, past the read gate. Defaults to the
   * reactor client, which withholds a drive the host's own key may not read.
   */
  driveStore?: DriveStore;
  reportError?: ReportError;
  /**
   * How often the credentials of authenticated WebSocket connections are
   * re-verified; a connection whose credential no longer holds is closed.
   * Defaults to {@link DEFAULT_WS_CREDENTIAL_RECHECK_INTERVAL_MS}; `0` turns the
   * periodic sweep off, leaving only the re-check on invalidation.
   */
  wsCredentialRecheckIntervalMs?: number;
};

/**
 * Where a subgraph came from: a core subgraph, the host, the generated
 * document-model subgraphs, or a package name. A name belongs to one origin:
 * the same origin replaces it, a higher-ranked one evicts it, and any other is
 * refused.
 */
const CORE_ORIGIN = Symbol("core");
const DOCUMENT_MODEL_ORIGIN = Symbol("document-models");
const HOST_ORIGIN = Symbol("host");
type SubgraphOrigin =
  | string
  | typeof CORE_ORIGIN
  | typeof DOCUMENT_MODEL_ORIGIN
  | typeof HOST_ORIGIN;
type TrackedOrigin = Exclude<
  SubgraphOrigin,
  typeof CORE_ORIGIN | typeof HOST_ORIGIN
>;

function describeOrigin(origin: SubgraphOrigin): string {
  if (origin === CORE_ORIGIN) return "core";
  if (origin === DOCUMENT_MODEL_ORIGIN) return "document models";
  if (origin === HOST_ORIGIN) return "the host";
  return `package ${origin}`;
}

function rank(origin: SubgraphOrigin): number {
  if (origin === CORE_ORIGIN) return 3;
  if (origin === HOST_ORIGIN) return 2;
  if (origin === DOCUMENT_MODEL_ORIGIN) return 1;
  return 0;
}

// Returning `false` closes 4403 with the reason `Forbidden`, so every refusal
// looks alike and a client cannot tell "sign in" from "that token is no good".

// An explicit close wins over the one graphql-ws would send, and carries a
// reason. Under `graphql-ws/use/ws` the connection is `ctx.extra`, whose
// `socket` is the `ws` WebSocket; narrowed here so the adapters keep passing a
// plain object through.
function refuseConnection(connection: WsConnection, reason: string): false {
  const { socket } = connection as {
    socket?: { close?: (code: number, reason: string) => void };
  };
  socket?.close?.(4403, reason);
  return false;
}

// The two halves of WebSocket auth: who is connected, and whether at all.

// graphql-ws calls `context` per operation and `onConnect` once per connection.

// A throw from `context` closes 4500, which clients treat as fatal; 4403 retries.

// So every refusal happens in `onConnect`, and `context` only reads the verdict.

// Admission matches HTTP: a bad bearer is refused, an absent one is no user.

// Anonymous is refused only under REQUIRE_AUTHENTICATED_CALLER, as for fetch.

// WS needs its own check: `ws` owns the upgrade, so the fetch chain never runs.

// Admitted anonymous connections authorize per document, as they do over SSE.
export function createWsAuthHandlers(opts: {
  authService?: AuthService;
  /** Re-verifies admitted connections and closes revoked ones. */
  credentialMonitor?: WsCredentialMonitor;
  /** Whether anonymous callers are refused; read at call time, not at build time. */
  requireAuthenticatedCaller: () => boolean;
  logger: ILogger;
  buildContext: (
    connectionParams: Record<string, unknown>,
    user?: User,
  ) => Context;
}): WsHandlers<Context> {
  const resolved = new WeakMap<WsConnection, User | undefined>();

  return {
    onConnect: async (connectionParams, connection) => {
      let user: User | null = null;

      if (opts.authService) {
        try {
          user =
            await opts.authService.authenticateWebSocketConnection(
              connectionParams,
            );
        } catch (error) {
          // `warn`: the caller sent a bad token, the server is fine.
          opts.logger.warn(
            "Refusing WebSocket connection: @error",
            error instanceof Error ? error.message : error,
          );
          return refuseConnection(connection, WS_CLOSE_REASON_BEARER_REJECTED);
        }
      }

      if (user === null && opts.requireAuthenticatedCaller()) {
        opts.logger.warn(
          "Refusing anonymous WebSocket connection: an authenticated caller is required",
        );
        return refuseConnection(
          connection,
          WS_CLOSE_REASON_AUTHENTICATION_REQUIRED,
        );
      }

      resolved.set(connection, user ?? undefined);
      if (user) {
        opts.credentialMonitor?.track(connection, user);
      }
      return true;
    },

    context: (connectionParams, connection) =>
      Promise.resolve(
        opts.buildContext(connectionParams, resolved.get(connection)),
      ),
  };
}

export class GraphQLManager {
  private initialized = false;
  private coreSubgraphsMap = new Map<string, ISubgraph[]>();
  private contextFields: Record<string, any> = {};
  private readonly subgraphs = new Map<string, ISubgraph[]>();

  private readonly subgraphWsDisposers = new Map<string, WsDisposer>();
  #authMiddleware: AuthFetchMiddleware | undefined;
  #requireAuthMiddleware: RequireAuthFetchMiddleware | undefined;
  #driveMiddleware: DriveFetchMiddleware | undefined;
  readonly driveOwnershipCache: DriveOwnershipCache;

  /** Cached document models for schema generation - updated on init and regenerate */
  private cachedDocumentModels: DocumentModelModule[] = [];

  private readonly subgraphHandlerCache = new Map<
    string,
    {
      handler: FetchHandler;
      subgraph: ISubgraph;
      generated: GeneratedDocumentModelTypes;
    }
  >();

  /** subgraphPath → the http adapter handle of its mounted route. */
  private readonly subgraphRouteHandles = new Map<string, AdapterRouteHandle>();

  /** Mounted SSE routes, keyed by path: the supergraph's and each subgraph's. */
  private readonly sseRouteHandles = new Map<string, AdapterRouteHandle>();

  /**
   * Origin → the subgraph instances registered from it. Core and host
   * subgraphs are not tracked. Tracks the package association so that
   * removed packages can be torn down (see unregisterPackage /
   * prunePackageSubgraphs).
   */
  private readonly packageSubgraphs = new Map<TrackedOrigin, Set<ISubgraph>>();

  readonly #origins = new WeakMap<ISubgraph, SubgraphOrigin>();

  /**
   * Package → the supergraph and subgraph classes (by subgraph name) it last
   * provided, so a subgraph refused or evicted for its name can register once
   * the name is free. `refused` keeps each one's instance until it is set
   * up, so the next attempt reuses it and a refusal that still holds logs
   * once.
   */
  #packageClasses = new Map<
    string,
    {
      supergraph: string;
      classes: Map<string, SubgraphClass>;
      refused: Map<string, ISubgraph>;
    }
  >();

  /** Registry changes run one at a time: a registration is admitted before
   * the awaits that complete it. */
  #registryChanges: Promise<unknown> = Promise.resolve();

  /** Active while a subgraph hook runs, so a registry change the hook makes
   * runs inline instead of waiting on the change that called the hook. Work
   * the hook detaches, such as a timer, enqueues as usual once the hook has
   * settled; while the hook is pending it cannot be told from awaited work
   * and runs inline too. */
  readonly #inHook = new AsyncLocalStorage<{ active: boolean }>();

  #generatedTypes:
    | {
        models: DocumentModelModule[];
        types: GeneratedDocumentModelTypes;
        sdl: string;
      }
    | undefined;

  /** Generated types no document model contributes, but `IDocument`. */
  #modelFreeTypeNames: ReadonlySet<string> | undefined;

  readonly #usesModelTypesMemo = new WeakMap<ISubgraph, boolean>();

  /** Refusals logged: model id, source key and reason. */
  #refusals = new Set<string>();

  readonly #schemaCache: DocumentModelSchemaCache;

  /** The schemas of the admitted document models. */
  #modelSchemas = new Map<DocumentModelModule, DocumentModelSchema>();

  /** Subgraphs excluded for a type collision, with the reason last logged. */
  readonly #loggedCollisions = new WeakMap<ISubgraph, string>();

  /** Supergraph exclusions for a lost claim, with the reason last logged. */
  readonly #loggedOwnershipExclusions = new WeakMap<ISubgraph, string>();

  readonly #claims = new WeakMap<
    ISubgraph,
    {
      typeDefs: DocumentNode;
      generated: GeneratedDocumentModelTypes;
      claims: SubgraphClaims;
    }
  >();

  /** Claim tie-break: kept across re-registration, so HMR keeps the owner. */
  readonly #registrationOrder = new Map<
    SubgraphOrigin,
    { order: number; names: Map<string, number> }
  >();

  /** Per-subgraph handlers by name, before auth/drive middleware is applied,
   * for in-process queries by trusted internals. */
  readonly #internalSubgraphHandlers = new Map<
    string,
    { subgraph: ISubgraph; path: string; handler: FetchHandler }
  >();

  /**
   * Optional reactor-drive client. When the switchboard is configured with a
   * reactor-drive container, this is provided and the resolvers dispatch to
   * it for reactor-drive parents.
   */
  readonly reactorDriveClient?: IDriveClient;
  private readonly authorizationService: IAuthorizationService;
  /** Route service in use: the injected one, or one built on first need. */
  #fallbackRoutes: HttpRouteService | undefined;

  private readonly path: string;
  private readonly httpServer: http.Server;
  private readonly wsServer: WebSocketServer;
  private readonly reactorClient: IReactorClient;
  private readonly relationalDb: IRelationalDb;
  private readonly analyticsStore: IAnalyticsStore;
  private readonly syncManager: ISyncManager;
  private readonly logger: ILogger;
  private readonly httpAdapter: IHttpAdapter;
  private readonly gatewayAdapter: IGatewayAdapter<Context>;
  private readonly authService?: AuthService;
  readonly #credentialMonitor: WsCredentialMonitor | undefined;
  private readonly documentPermissionService?: DocumentPermissionService;
  private readonly featureFlags: GraphqlManagerFeatureFlags;
  private readonly port: number;
  private readonly syncServingGate?: SyncScopeGate;
  private readonly httpRoutes?: HttpRouteService;
  private readonly attachments?: IAttachmentClientProvider;
  private readonly inspection?: IReactorInspectionSource;
  readonly #reporting: RunDetachedOptions;

  constructor(options: GraphQLManagerOptions) {
    this.path = options.path;
    this.httpServer = options.httpServer;
    this.wsServer = options.wsServer;
    this.reactorClient = options.reactorClient;
    this.relationalDb = options.relationalDb;
    this.analyticsStore = options.analyticsStore;
    this.syncManager = options.syncManager;
    this.logger = options.logger;
    this.httpAdapter = options.httpAdapter;
    this.gatewayAdapter = options.gatewayAdapter;
    this.authService = options.authService;
    if (options.authService) {
      this.#credentialMonitor = new WsCredentialMonitor({
        authService: options.authService,
        intervalMs:
          options.wsCredentialRecheckIntervalMs ??
          DEFAULT_WS_CREDENTIAL_RECHECK_INTERVAL_MS,
        logger: options.logger,
      });
      this.#credentialMonitor.start();
    }
    this.documentPermissionService = options.documentPermissionService;
    this.featureFlags = options.featureFlags ?? DefaultFeatureFlags;
    const subgraph = !!this.featureFlags.enableDocumentModelSubgraphs;
    this.#schemaCache = new DocumentModelSchemaCache((model) =>
      buildDocumentModelSchema(model, { subgraph }),
    );
    this.port = options.port ?? 4001;
    this.authorizationService = options.authorizationService;
    this.reactorDriveClient = options.reactorDriveClient;
    this.syncServingGate = options.syncServingGate;
    this.httpRoutes = options.httpRoutes;
    this.attachments = options.attachments;
    this.inspection = options.inspection;
    this.#reporting = { logger: options.logger, report: options.reportError };

    this.driveOwnershipCache = new DriveOwnershipCache(
      options.driveStore ?? this.reactorClient,
    );

    // Each subscription-enabled subgraph adds listeners to the shared wsServer
    // via graphql-ws's useServer(). The handler cache bounds the count, so
    // unlimited is safe here.
    this.wsServer.setMaxListeners(0);
  }

  async init(
    coreSubgraphs: SubgraphClass[],
    authMiddleware?: AuthFetchMiddleware,
    requireAuthMiddleware?: RequireAuthFetchMiddleware,
  ) {
    this.#authMiddleware = authMiddleware;
    this.#requireAuthMiddleware = requireAuthMiddleware;
    this.logger.debug(`Initializing Subgraph Manager...`);

    await this.driveOwnershipCache.init();
    this.#driveMiddleware = createDriveFetchMiddleware(
      this.driveOwnershipCache,
    );
    this.logger.debug(
      `Drive ownership cache populated with ${this.driveOwnershipCache.size()} drives`,
    );

    // check if Document Drive model is available
    const modulesResult = await this.reactorClient.getDocumentModelModules();
    const models = modulesResult.results;

    const driveModel = models.find(
      (it: DocumentModelModule) =>
        it.documentModel.global.name === "DocumentDrive",
    );
    if (!driveModel) {
      throw new Error("DocumentDrive model required");
    }

    await this.gatewayAdapter.start(this.httpServer);

    this.httpAdapter.setupMiddleware({ bodyLimit: "50mb" });

    // Register REST endpoint for drive info as a framework-agnostic FetchHandler.
    // posix.join, not join: these are URL routes, and on Windows path.join
    // would emit backslashes, mounting the route at "\d\:drive" so every
    // request 404s.
    const driveRoutePath = path.posix.join(this.path, "d/:drive");
    const driveMatcher = match<{ drive: string }>(driveRoutePath);
    const driveInfoHandler = async (request: Request): Promise<Response> => {
      const url = new URL(request.url);
      const matched = driveMatcher(url.pathname);
      const driveIdOrSlug = matched ? matched.params.drive : undefined;

      if (!driveIdOrSlug) {
        return Response.json(
          { error: "Drive ID or slug is required" },
          { status: 400 },
        );
      }

      const user = getAuthContext(request)?.user;
      try {
        // Read as the caller, so a drive whose domain it may not read serves
        // its header alone; discovery must still reach graphqlEndpoint.
        const driveDoc = await this.reactorClient.get<DocumentDriveDocument>(
          driveIdOrSlug,
          { subject: callerSubject(user) },
        );

        // Drive metadata is a document read, so it answers to the same
        // authorization as every GraphQL read (`assertCanReadCanonical`).
        // 404 rather than 403: a caller who may not read the drive must not
        // be able to tell "protected" from "does not exist" by probing slugs.
        const canRead = await this.authorizationService.canRead(
          driveDoc.header.id as CanonicalDocumentId,
          user?.address,
        );
        if (!canRead) {
          this.logger.debug(`Drive read refused: ${driveIdOrSlug}`);
          return Response.json({ error: "Drive not found" }, { status: 404 });
        }

        const forwardedProto = request.headers
          .get("x-forwarded-proto")
          ?.split(",")[0]
          .trim();
        const protocol =
          (forwardedProto ?? url.protocol.replace(":", "")) + ":";
        const forwardedHost = request.headers
          .get("x-forwarded-host")
          ?.split(",")[0]
          .trim();
        const host = forwardedHost ?? request.headers.get("host") ?? "";
        const forwardedPrefix =
          request.headers
            .get("x-forwarded-prefix")
            ?.split(",")[0]
            .trim()
            .replace(/\/$/, "") ?? "";
        const localBase = this.path === "/" ? "" : this.path;
        const basePath = forwardedPrefix + localBase;
        const graphqlEndpoint = `${protocol}//${host}${basePath}/graphql/r`;

        // Absent when the gate stripped it.
        const global = (driveDoc.state as Partial<typeof driveDoc.state>)
          .global;
        return Response.json({
          id: driveDoc.header.id,
          slug: driveDoc.header.slug,
          meta: driveDoc.header.meta,
          name: global?.name || driveDoc.header.name,
          icon: global?.icon ?? undefined,
          ...(graphqlEndpoint && { graphqlEndpoint }),
        });
      } catch (error: unknown) {
        this.logger.debug(
          "Drive not found: @drive (@error)",
          driveIdOrSlug,
          error,
        );
        return Response.json({ error: "Drive not found" }, { status: 404 });
      }
    };

    // Identity resolution only — deliberately not the full
    // `#composeFetchMiddleware` chain. Drive discovery is the one read a
    // client makes before it can authenticate anything: Connect reads
    // `graphqlEndpoint` from here to register the sync remote, so a blanket
    // require-auth gate would leave an anonymous caller unable to ever reach
    // the authenticated surface. The bearer is read when present (an invalid
    // one is still a 401 from the auth middleware) and the drive is then
    // authorized individually, above. The drive-shard middleware is skipped
    // too: any healthy backend can answer this route.
    this.httpAdapter.mount(
      driveRoutePath,
      this.#authMiddleware
        ? this.#authMiddleware(driveInfoHandler)
        : driveInfoHandler,
    );
    this.logger.info(`Registered REST endpoint: GET ${driveRoutePath}`);

    await this.#setupCoreSubgraphs("graphql", coreSubgraphs, models);

    if (this.featureFlags.enableDocumentModelSubgraphs) {
      await this.#setupDocumentModelSubgraphs(
        "graphql",
        this.cachedDocumentModels,
      );
    }

    await this.#createSupergraphGateway();

    return this.updateRouter();
  }

  /**
   * Regenerate document model subgraphs when models are dynamically loaded.
   * Fetches current modules from reactor client (source of truth).
   */
  async regenerateDocumentModelSubgraphs(): Promise<void> {
    if (!this.featureFlags.enableDocumentModelSubgraphs) {
      return;
    }
    await this.#serialize(() => this.#regenerateDocumentModelSubgraphs());
  }

  async #regenerateDocumentModelSubgraphs(): Promise<void> {
    try {
      const modulesResult = await this.reactorClient.getDocumentModelModules();
      const models = modulesResult.results;
      this.cachedDocumentModels = this.#admitModels(models);

      const registeredNames = await this.#setupDocumentModelSubgraphs(
        "graphql",
        this.cachedDocumentModels,
      );
      // A model removed since the last regeneration (e.g. its package was
      // uninstalled) must lose its subgraph; replacing alone would keep it.
      await this.#pruneOrigin(DOCUMENT_MODEL_ORIGIN, registeredNames);
      await this.#restorePackageSubgraphs();
      this.#scheduleRouterUpdate();
      this.logger.info(
        "Regenerated document model subgraphs with @count models",
        models.length,
      );
    } catch (error) {
      this.logger.error(
        "Failed to regenerate document model subgraphs: @error",
        error,
      );
      throw error;
    }
  }

  async #setupCoreSubgraphs(
    supergraph: string,
    coreSubgraphs: SubgraphClass[],
    models: DocumentModelModule[],
  ) {
    for (const subgraph of coreSubgraphs) {
      try {
        await this.registerSubgraph(subgraph, supergraph, true);
      } catch (error) {
        this.logger.error(
          "Failed to setup core subgraph @subgraph: @error",
          subgraph.name,
          error,
        );
      }
    }

    // Core types take precedence: models are admitted against them once they
    // are registered, before any schema is built.
    this.cachedDocumentModels = this.#admitModels(models);
    return this.#setupSubgraphs(this.coreSubgraphsMap);
  }

  /** Models whose schemas build and take no reserved name. */
  #admitModels(models: DocumentModelModule[]): DocumentModelModule[] {
    const reserved = reservedTypeNames(
      Array.from(this.coreSubgraphsMap.values(), (subgraphs) =>
        subgraphs.map((subgraph) => subgraph.typeDefs),
      ).flat(),
    );
    const refusals = new Set<string>();
    const schemas = new Map<DocumentModelModule, DocumentModelSchema>();
    const admitted: DocumentModelModule[] = [];
    for (const { model, key, schema, error } of this.#schemaCache.resolve(
      models,
    )) {
      const id = model.documentModel.global.id;
      const refuse = (message: string, reason: string) => {
        const refusal = `${id}\n${key}\n${reason}`;
        refusals.add(refusal);
        if (!this.#refusals.has(refusal)) {
          this.logger.error(message, id, reason);
        }
      };
      const refuseModel = (reason: string) =>
        refuse(
          "Refusing document model @documentType from the GraphQL schema: @reason",
          reason,
        );
      if (!schema) {
        refuseModel(`has an unusable schema: ${error.message}`);
        continue;
      }
      const taken = this.#reservedNamesReason(model, schema, reserved);
      if (taken !== undefined) {
        refuseModel(taken);
        continue;
      }
      if (schema.subgraphError) {
        refuse(
          "Refusing the subgraph of document model @documentType: @reason",
          `has an unusable subgraph schema: ${schema.subgraphError.message}`,
        );
      }
      schemas.set(model, schema);
      admitted.push(model);
    }
    this.#refusals = refusals;
    this.#modelSchemas = schemas;
    return admitted;
  }

  #reservedNamesReason(
    model: DocumentModelModule,
    schema: DocumentModelSchema,
    reserved: ReservedTypeNames,
  ): string | undefined {
    const taken = reservedTypeNamesTaken(model, reserved, schema.generated);
    return taken.length > 0
      ? `generates reserved type names: ${taken.join(", ")}`
      : undefined;
  }

  async #setupDocumentModelSubgraphs(
    supergraph: string,
    documentModels: DocumentModelModule[],
  ): Promise<Set<string>> {
    const latestDocumentModels =
      filterLatestDocumentModelVersions(documentModels);
    const registeredNames = new Set<string>();

    for (const documentModel of latestDocumentModels) {
      if (
        DOCUMENT_MODELS_TO_EXCLUDE.includes(
          documentModel.documentModel.global.id,
        )
      ) {
        continue;
      }
      const types = this.#modelSchemas.get(documentModel)?.subgraph;
      if (!types) continue;
      try {
        const subgraphInstance = new DocumentModelSubgraph(
          documentModel,
          {
            http: this.scopeForPackage(CORE_PACKAGE_NAME),
            relationalDb: this.relationalDb,
            analyticsStore: this.analyticsStore,
            reactorClient: this.reactorClient,
            graphqlManager: this,
            syncManager: this.syncManager,
            path: this.path,
            documentPermissionService: this.documentPermissionService,
            authorizationService: this.authorizationService,
            syncServingGate: this.syncServingGate,
            attachments: this.attachments,
            inspection: this.inspection,
          },
          types,
        );

        const registered = await this.#addSubgraphInstance(
          subgraphInstance,
          supergraph,
          false,
          DOCUMENT_MODEL_ORIGIN,
        );
        if (registered) registeredNames.add(registered.name);
      } catch (error) {
        this.logger.error(
          "Failed to setup document model subgraph for @documentType: @error",
          documentModel.documentModel.global.id,
          error instanceof Error ? error.message : error,
        );
        this.logger.debug("@error", error);
      }
    }

    // Mounted by the next router update.
    return registeredNames;
  }

  /** The first subgraph named `name` in `subgraphsMap`. */
  #findByName(
    subgraphsMap: Map<string, ISubgraph[]>,
    name: string,
  ): ISubgraph | undefined {
    for (const subgraphs of subgraphsMap.values()) {
      const found = subgraphs.find((it) => it.name === name);
      if (found) return found;
    }
    return undefined;
  }

  /** Every registered subgraph named `name`, core or not, in any bucket: the
   * in-process handler map is keyed by bare name, so a name has one owner. */
  #holdersOf(name: string): Set<ISubgraph> {
    const holders = new Set<ISubgraph>();
    for (const subgraphsMap of [this.coreSubgraphsMap, this.subgraphs]) {
      for (const subgraphs of subgraphsMap.values()) {
        for (const subgraph of subgraphs) {
          if (subgraph.name === name) holders.add(subgraph);
        }
      }
    }
    return holders;
  }

  /** Core subgraph names are reserved: no other subgraph may take one. */
  #isCoreNameReserved(name: string): boolean {
    return this.#findByName(this.coreSubgraphsMap, name) !== undefined;
  }

  /** Buckets whose mount paths a registration into `supergraph` occupies: a
   * named supergraph's subgraphs are mounted under `graphql` as well. */
  #mountBuckets(supergraph: string): string[] {
    return supergraph === "" || supergraph === "graphql"
      ? [supergraph]
      : [supergraph, "graphql"];
  }

  #generated(): GeneratedDocumentModelTypes {
    if (this.#generatedTypes?.models !== this.cachedDocumentModels) {
      const types = getGeneratedDocumentModelTypes(
        this.cachedDocumentModels,
        this.#modelSchemas,
      );
      const sdl = print({
        kind: Kind.DOCUMENT,
        definitions: types.definitions,
      });
      // Unchanged types keep their identity, so handlers built on them stay.
      this.#generatedTypes = {
        models: this.cachedDocumentModels,
        types:
          sdl === this.#generatedTypes?.sdl
            ? this.#generatedTypes.types
            : types,
        sdl,
      };
    }
    return this.#generatedTypes.types;
  }

  #schemaOptions(subgraph: ISubgraph): SubgraphSchemaOptions {
    return {
      generated: this.#generated(),
      ownTypeNames:
        subgraph instanceof DocumentModelSubgraph
          ? subgraph.generatedTypeNames
          : undefined,
    };
  }

  /** Whether `subgraph`'s own typeDefs refer to a document model's types. */
  #usesModelTypes(subgraph: ISubgraph): boolean {
    const memo = this.#usesModelTypesMemo.get(subgraph);
    if (memo !== undefined) return memo;
    if (!this.#modelFreeTypeNames) {
      const names = new Set(getGeneratedDocumentModelTypes([]).names);
      names.delete("IDocument");
      this.#modelFreeTypeNames = names;
    }
    const modelFree = this.#modelFreeTypeNames;
    const own = typeDefinitionNames(subgraph.typeDefs);
    const referenced: string[] = [];
    const collect = (node: { name: { value: string } }) => {
      referenced.push(node.name.value);
    };
    visit(subgraph.typeDefs, {
      NamedType: collect,
      ScalarTypeExtension: collect,
      ObjectTypeExtension: collect,
      InterfaceTypeExtension: collect,
      UnionTypeExtension: collect,
      EnumTypeExtension: collect,
      InputObjectTypeExtension: collect,
    });
    const uses = referenced.some(
      (name) =>
        !own.has(name) &&
        !modelFree.has(name) &&
        !NON_MODEL_TYPE_NAMES.has(name),
    );
    this.#usesModelTypesMemo.set(subgraph, uses);
    return uses;
  }

  /** The generated type names `subgraph` redefines under the current models. */
  #typeCollisions(subgraph: ISubgraph): string[] {
    try {
      return findSubgraphTypeCollisions(
        this.#generated(),
        subgraph.typeDefs,
        this.#schemaOptions(subgraph).ownTypeNames,
      );
    } catch {
      // Malformed typeDefs fail where the schema is built, and are logged there.
      return [];
    }
  }

  /** Whether a model loaded since registration collides with `subgraph`'s
   * types. Each new collision is logged once. */
  #isExcludedForTypes(subgraph: ISubgraph): boolean {
    const collisions = this.#typeCollisions(subgraph);
    if (collisions.length === 0) {
      this.#loggedCollisions.delete(subgraph);
      return false;
    }
    const reason = new SubgraphTypeCollisionError(collisions).message;
    if (this.#loggedCollisions.get(subgraph) !== reason) {
      this.#loggedCollisions.set(subgraph, reason);
      this.logger.error(
        "Excluding subgraph @name: @error",
        subgraph.name,
        reason,
      );
    }
    return true;
  }

  /**
   * Whether `instance` may register, and what it replaces. A name has one
   * holder across every bucket: the same origin replaces it, a higher rank
   * (core > host > document models > package) evicts it, and anything else is
   * refused.
   */
  #admit(
    instance: ISubgraph,
    core: boolean,
    origin: SubgraphOrigin,
  ):
    | { action: "skip"; existing: ISubgraph }
    | { action: "reject" }
    | { action: "add"; replaces: ISubgraph[]; evicts: ISubgraph[] } {
    // A package subgraph may not take a name a core subgraph has registered:
    // the in-process handler map is keyed by bare name, so a same-name
    // subgraph would shadow the core one (issue #2972).
    if (!core && this.#isCoreNameReserved(instance.name)) {
      this.logger.error(
        "Rejecting subgraph @name: name is reserved by a registered core subgraph",
        instance.name,
      );
      return { action: "reject" };
    }

    const holders = this.#holdersOf(instance.name);
    if (holders.has(instance)) return { action: "skip", existing: instance };

    const rivals = Array.from(holders).filter(
      (holder) => this.#originOf(holder) !== origin,
    );
    for (const holder of rivals) {
      const holderOrigin = this.#originOf(holder);
      if (rank(origin) <= rank(holderOrigin)) {
        this.logger.error(
          "Rejecting subgraph @name from @origin: name is taken by a subgraph from @existing",
          instance.name,
          describeOrigin(origin),
          describeOrigin(holderOrigin),
        );
        return { action: "reject" };
      }
    }

    const collisions = core ? [] : this.#typeCollisions(instance);
    if (collisions.length > 0) {
      const reason = new SubgraphTypeCollisionError(collisions).message;
      if (this.#loggedCollisions.get(instance) !== reason) {
        this.#loggedCollisions.set(instance, reason);
        this.logger.error(
          "Rejecting subgraph @name: @error",
          instance.name,
          reason,
        );
      }
      return { action: "reject" };
    }

    return {
      action: "add",
      replaces: Array.from(holders).filter((it) => !rivals.includes(it)),
      evicts: rivals,
    };
  }

  #originOf(instance: ISubgraph): SubgraphOrigin {
    return this.#origins.get(instance) ?? HOST_ORIGIN;
  }

  async #addSubgraphInstance(
    subgraphInstance: ISubgraph,
    supergraph = "",
    core = false,
    origin: SubgraphOrigin = HOST_ORIGIN,
  ) {
    if (core) origin = CORE_ORIGIN;
    // Rejections log rather than throw - package registration runs from a
    // detached async closure in server.ts, where a throw is an unhandled
    // rejection that takes the host down.
    const admission = this.#admit(subgraphInstance, core, origin);
    if (admission.action === "reject") return undefined;
    if (admission.action === "skip") {
      this.logger.debug(
        `Skipping duplicate subgraph: ${subgraphInstance.name}`,
      );
      return admission.existing;
    }

    const { replaces, evicts } = admission;
    for (const replaced of replaces) {
      await this.#removeSubgraphInstance(replaced);
    }
    if (typeof origin === "string") {
      const refused = this.#packageClasses.get(origin)?.refused;
      if (refused?.get(subgraphInstance.name) === subgraphInstance) {
        refused.delete(subgraphInstance.name);
      }
    }

    await this.#runHook(() => subgraphInstance.onSetup?.());

    // After setup, so a subgraph that fails to set up leaves the holder.
    for (const evicted of evicts) {
      this.logger.error(
        "Evicting subgraph @name from @existing: @origin outranks it",
        subgraphInstance.name,
        describeOrigin(this.#originOf(evicted)),
        describeOrigin(origin),
      );
      await this.#removeSubgraphInstance(evicted);
    }

    const subgraphsMap = core ? this.coreSubgraphsMap : this.subgraphs;
    for (const bucket of this.#mountBuckets(supergraph)) {
      const subgraphs = subgraphsMap.get(bucket);
      if (subgraphs) {
        subgraphs.push(subgraphInstance);
      } else if (bucket === supergraph) {
        subgraphsMap.set(bucket, [subgraphInstance]);
      }
    }

    this.#origins.set(subgraphInstance, origin);
    this.#recordRegistrationOrder(origin, subgraphInstance.name);
    if (origin !== HOST_ORIGIN && origin !== CORE_ORIGIN) {
      let instances = this.packageSubgraphs.get(origin);
      if (!instances) {
        instances = new Set();
        this.packageSubgraphs.set(origin, instances);
      }
      instances.add(subgraphInstance);
    }
    this.logger.info(
      `${replaces.length + evicts.length > 0 ? "Replaced" : "Registered"} ${this.path.endsWith("/") ? this.path : this.path + "/"}${supergraph ? supergraph + "/" : ""}${subgraphInstance.name} subgraph.`,
    );
    return subgraphInstance;
  }

  #recordRegistrationOrder(origin: SubgraphOrigin, name: string) {
    let entry = this.#registrationOrder.get(origin);
    if (!entry) {
      entry = { order: this.#registrationOrder.size, names: new Map() };
      this.#registrationOrder.set(origin, entry);
    }
    if (!entry.names.has(name)) entry.names.set(name, entry.names.size);
  }

  /**
   * Take `instance` off the mount paths of `buckets`. It is torn down
   * entirely unless it is still registered in another bucket.
   */
  async #detachSubgraph(instance: ISubgraph, buckets: readonly string[]) {
    const elsewhere = [this.coreSubgraphsMap, this.subgraphs].some((map) =>
      Array.from(map).some(
        ([bucket, subgraphs]) =>
          !buckets.includes(bucket) && subgraphs.includes(instance),
      ),
    );
    if (!elsewhere) {
      return this.#removeSubgraphInstance(instance);
    }
    for (const subgraphsMap of [this.coreSubgraphsMap, this.subgraphs]) {
      for (const bucket of buckets) {
        const subgraphs = subgraphsMap.get(bucket);
        if (!subgraphs?.includes(instance)) continue;
        subgraphsMap.set(
          bucket,
          subgraphs.filter((it) => it !== instance),
        );
        await this.#unmountSubgraph(instance, bucket);
      }
    }
  }

  /** Unmount what `instance` serves at its path in `bucket`: route, handler
   * cache, SSE route, WebSocket handler and in-process handler. */
  async #unmountSubgraph(instance: ISubgraph, bucket: string) {
    const subgraphPath = this.#getSubgraphPath(instance, bucket);
    if (this.subgraphHandlerCache.get(subgraphPath)?.subgraph !== instance) {
      return;
    }
    this.subgraphHandlerCache.delete(subgraphPath);

    const routeHandle = this.subgraphRouteHandles.get(subgraphPath);
    if (routeHandle !== undefined) {
      routeHandle.dispose();
      this.subgraphRouteHandles.delete(subgraphPath);
    }
    this.#disposeSSERoute(subgraphPath);

    const internalHandler = this.#internalSubgraphHandlers.get(instance.name);
    if (internalHandler?.path === subgraphPath) {
      this.#internalSubgraphHandlers.delete(instance.name);
    }

    const wsDisposer = this.subgraphWsDisposers.get(subgraphPath);
    if (wsDisposer) {
      this.subgraphWsDisposers.delete(subgraphPath);
      try {
        await wsDisposer.dispose();
      } catch (error) {
        this.logger.error(
          "Error disposing subgraph websocket @name: @error",
          instance.name,
          error,
        );
      }
    }
  }

  /**
   * Tear down a subgraph instance: disconnect it, drop it from every
   * bucket, unmount its route, dispose its WebSocket handler, and remove
   * its internal handler. Used when a subgraph is replaced or its package
   * is removed; #setupSubgraphs then never re-mounts it.
   */
  async #removeSubgraphInstance(instance: ISubgraph) {
    try {
      await this.#runHook(() => instance.onDisconnect?.());
    } catch (error) {
      this.logger.error(
        "Error disconnecting subgraph @name: @error",
        instance.name,
        error,
      );
    }

    for (const subgraphsMap of [this.coreSubgraphsMap, this.subgraphs]) {
      for (const [bucket, subgraphs] of subgraphsMap.entries()) {
        if (!subgraphs.includes(instance)) {
          continue;
        }
        subgraphsMap.set(
          bucket,
          subgraphs.filter((it) => it !== instance),
        );
        await this.#unmountSubgraph(instance, bucket);
      }
    }

    const internalHandler = this.#internalSubgraphHandlers.get(instance.name);
    if (internalHandler?.subgraph === instance) {
      this.#internalSubgraphHandlers.delete(instance.name);
    }

    const origin = this.#origins.get(instance);
    this.#origins.delete(instance);
    if (
      origin === undefined ||
      origin === HOST_ORIGIN ||
      origin === CORE_ORIGIN
    ) {
      return;
    }
    const instances = this.packageSubgraphs.get(origin);
    instances?.delete(instance);
    if (instances?.size === 0) {
      this.packageSubgraphs.delete(origin);
    }
  }

  /**
   * Register a pre-constructed subgraph instance.
   * Use this when you need to pass custom dependencies to a subgraph.
   */
  async registerSubgraphInstance(
    subgraphInstance: ISubgraph,
    supergraph = "",
    core = false,
  ) {
    return this.#serialize(() =>
      this.#addSubgraphInstance(subgraphInstance, supergraph, core),
    );
  }

  #serialize<T>(task: () => Promise<T>): Promise<T> {
    if (this.#inHook.getStore()?.active) return task();
    const run = this.#registryChanges.then(() => this.#inHook.exit(task));
    this.#registryChanges = run.catch(() => undefined);
    return run;
  }

  async #runHook(hook: () => Promise<void> | undefined): Promise<void> {
    const scope = { active: true };
    try {
      await this.#inHook.run(scope, hook);
    } finally {
      scope.active = false;
    }
  }

  /** Refresh the router after a registry change; scheduled rather than
   * awaited when called from inside one. */
  async #refreshRouter(): Promise<void> {
    if (this.#inHook.getStore()?.active) {
      this.#scheduleRouterUpdate();
      return;
    }
    await this.updateRouter();
  }

  /** Not awaited: a registry change does not wait out the debounce. */
  #scheduleRouterUpdate(): void {
    // Outside the registry change: the update runs after it has finished.
    this.#inHook.exit(() => {
      void runDetached(
        "Router update",
        () => this.updateRouter(),
        this.#reporting,
      );
    });
  }

  /**
   * Get the base path used for subgraph registration.
   */
  getBasePath(): string {
    return this.path;
  }

  /**
   * Get the authorization service shared with subgraphs. Use this when
   * constructing a subgraph instance externally for
   * {@link registerSubgraphInstance}.
   */
  getAuthorizationService(): IAuthorizationService {
    return this.authorizationService;
  }

  /**
   * The HTTP scope a package's subgraphs get. Falls back to a scope over a
   * throwaway service when route hosting is not configured, so a subgraph can
   * always rely on `args.http` existing.
   */
  scopeForPackage(packageName: string): IHttpScope {
    this.#fallbackRoutes ??=
      this.httpRoutes ??
      new HttpRouteService({
        httpAdapter: this.httpAdapter,
        basePath: this.path,
        authService: this.authService,
      });
    // Non-throwing: a package key with no usable name yields a scope that
    // refuses registrations, rather than taking the host down at boot.
    return this.#fallbackRoutes.scopeForOrNull(packageName);
  }

  /**
   * Register a subgraph class. `packageName` labels the resulting instance
   * with its contributing package so the instance can be torn down when the
   * package is removed or drops the subgraph (see unregisterPackage and
   * prunePackageSubgraphs), and decides the namespace its REST routes and
   * webhooks live under.
   */
  async registerSubgraph(
    subgraph: SubgraphClass,
    supergraph = "",
    core = false,
    packageName?: string,
  ) {
    return this.#serialize(() => {
      const instance = this.#createSubgraphInstance(subgraph, packageName);
      if (packageName !== undefined && !core) {
        this.#recordPackageClass(packageName, supergraph, instance, subgraph);
      }
      return this.#addSubgraphInstance(
        instance,
        supergraph,
        core,
        packageName ?? HOST_ORIGIN,
      );
    });
  }

  #recordPackageClass(
    packageName: string,
    supergraph: string,
    instance: ISubgraph,
    subgraph: SubgraphClass,
  ): void {
    let entry = this.#packageClasses.get(packageName);
    if (!entry) {
      entry = { supergraph, classes: new Map(), refused: new Map() };
      this.#packageClasses.set(packageName, entry);
    }
    entry.classes.set(instance.name, subgraph);
    entry.refused.set(instance.name, instance);
  }

  /** Register package subgraphs that are missing because their name was
   * taken when they last tried, now that the name may be free. */
  async #restorePackageSubgraphs(): Promise<void> {
    for (const [
      packageName,
      { supergraph, classes, refused },
    ] of this.#packageClasses) {
      const registered = Array.from(
        this.packageSubgraphs.get(packageName) ?? [],
        (it) => it.name,
      );
      for (const [name, subgraph] of classes) {
        if (registered.includes(name)) continue;
        if (this.#holdersOf(name).size > 0) continue;
        try {
          const instance =
            refused.get(name) ??
            this.#createSubgraphInstance(subgraph, packageName);
          refused.set(name, instance);
          await this.#addSubgraphInstance(
            instance,
            supergraph,
            false,
            packageName,
          );
        } catch (error) {
          this.logger.error(
            "Failed to restore subgraph @name from @package: @error",
            name,
            packageName,
            error,
          );
        }
      }
    }
  }

  #createSubgraphInstance(
    subgraph: SubgraphClass,
    packageName?: string,
  ): ISubgraph {
    return new subgraph({
      // Left undefined, the subgraph is core rather than contributed, and its
      // routes hang off reactor-api's own namespace. Not defaulted in the
      // parameter, because `undefined` is what keeps a core subgraph out of
      // `packageSubgraphs` and so out of package teardown.
      http: this.scopeForPackage(packageName ?? CORE_PACKAGE_NAME),
      relationalDb: this.relationalDb,
      analyticsStore: this.analyticsStore,
      reactorClient: this.reactorClient,
      graphqlManager: this,
      syncManager: this.syncManager,
      path: this.path,
      documentPermissionService: this.documentPermissionService,
      authorizationService: this.authorizationService,
      syncServingGate: this.syncServingGate,
      attachments: this.attachments,
      inspection: this.inspection,
      credentials: createCredentialInvalidator(this.authService),
    });
  }

  /**
   * Apply a package change: `packaged` holds every loaded package's subgraph
   * classes. Removals run before additions, so a name one package gives up
   * can be taken by another in the same change. Changes apply one at a time;
   * the router refresh is scheduled, not awaited.
   */
  applyPackageSubgraphs(
    packaged: ReadonlyMap<string, readonly SubgraphClass[]>,
    supergraph = "graphql",
  ): Promise<void> {
    return this.#serialize(() =>
      this.#applyPackageSubgraphs(packaged, supergraph),
    );
  }

  async #applyPackageSubgraphs(
    packaged: ReadonlyMap<string, readonly SubgraphClass[]>,
    supergraph: string,
  ): Promise<void> {
    // Includes packages registered through registerSubgraph, e.g. at boot.
    const known = new Set([
      ...this.#packageClasses.keys(),
      ...Array.from(this.packageSubgraphs.keys()).filter(
        (origin) => typeof origin === "string",
      ),
    ]);
    for (const packageName of known) {
      if (!packaged.has(packageName)) {
        await this.#teardownPackage(packageName);
      }
    }
    this.#packageClasses = new Map();

    const incoming = new Map<string, ISubgraph[]>();
    for (const [packageName, classes] of packaged) {
      const instances: ISubgraph[] = [];
      for (const subgraph of classes) {
        try {
          const instance = this.#createSubgraphInstance(subgraph, packageName);
          this.#recordPackageClass(packageName, supergraph, instance, subgraph);
          instances.push(instance);
        } catch (error) {
          this.logger.error(
            "Failed to create subgraph @subgraph from @package: @error",
            subgraph.name,
            packageName,
            error,
          );
        }
      }
      incoming.set(packageName, instances);
      await this.#pruneOrigin(
        packageName,
        new Set(instances.map((it) => it.name)),
      );
    }

    for (const [packageName, instances] of incoming) {
      const registered = new Set<string>();
      for (const instance of instances) {
        try {
          const result = await this.#addSubgraphInstance(
            instance,
            supergraph,
            false,
            packageName,
          );
          if (result) registered.add(result.name);
        } catch (error) {
          this.logger.error(
            "Failed to register subgraph @name from @package: @error",
            instance.name,
            packageName,
            error,
          );
        }
      }
      // A refused subgraph must not shield a stale same-named one.
      await this.#pruneOrigin(packageName, registered);
    }

    this.#scheduleRouterUpdate();
  }

  /**
   * Tear down every subgraph instance registered from `packageName`:
   * disconnects the instances, unmounts their routes, disposes their
   * WebSocket handlers, then refreshes the router so the supergraph SDL and
   * the supergraph SSE handler no longer reference them. No-op if the
   * package has no registered subgraphs.
   */
  async unregisterPackage(packageName: string): Promise<void> {
    // Routes and webhooks belong to the package, not to its subgraphs, so this
    // runs before the early return below: a package may contribute a processor
    // that registers routes and no subgraph at all, and its routes still have
    // to go. A route that outlives its package answers against unloaded code.
    const removed = await this.#serialize(async () => {
      if (!(await this.#teardownPackage(packageName))) return false;
      await this.#restorePackageSubgraphs();
      return true;
    });
    if (removed) {
      await this.#refreshRouter();
    }
  }

  /** Release the package's routes and subgraphs; whether any subgraph went. */
  async #teardownPackage(packageName: string): Promise<boolean> {
    this.#disposeHttpScope(packageName);
    this.#packageClasses.delete(packageName);

    const instances = this.packageSubgraphs.get(packageName);
    if (!instances || instances.size === 0) return false;
    for (const instance of Array.from(instances)) {
      await this.#removeSubgraphInstance(instance);
    }
    return true;
  }

  /**
   * Releases the package's HTTP scope: every route it mounted, and its webhook
   * registrations. Idempotent, and silent for a package that never had one.
   */
  #disposeHttpScope(packageName: string): void {
    const routes = this.#fallbackRoutes ?? this.httpRoutes;
    try {
      routes?.disposeScope(packageName);
    } catch (error) {
      // Teardown must not be the thing that fails: a package whose name never
      // resolved to a namespace has nothing mounted to release anyway.
      this.logger.warn(
        `Failed to release HTTP routes for "@package": @error`,
        packageName,
        error,
      );
    }
  }

  /**
   * Remove this package's registered subgraphs whose names are not in
   * `keepNames` — the package is still loaded but dropped some of its
   * subgraphs. Refreshes the router if anything was removed.
   */
  async prunePackageSubgraphs(
    packageName: string,
    keepNames: ReadonlySet<string>,
  ): Promise<void> {
    const removed = await this.#serialize(async () => {
      const classes = this.#packageClasses.get(packageName)?.classes;
      for (const name of Array.from(classes?.keys() ?? [])) {
        if (!keepNames.has(name)) classes?.delete(name);
      }
      const pruned = await this.#pruneOrigin(packageName, keepNames);
      if (pruned > 0) await this.#restorePackageSubgraphs();
      return pruned;
    });
    if (removed > 0) {
      await this.#refreshRouter();
    }
  }

  /** Remove the origin's subgraphs not named in `keepNames`; how many went. */
  async #pruneOrigin(
    origin: TrackedOrigin,
    keepNames: ReadonlySet<string>,
  ): Promise<number> {
    const instances = this.packageSubgraphs.get(origin);
    if (!instances) return 0;
    let removed = 0;
    for (const instance of Array.from(instances)) {
      if (!keepNames.has(instance.name)) {
        await this.#removeSubgraphInstance(instance);
        removed++;
      }
    }
    return removed;
  }

  /** Find a registered subgraph by name, core or package-contributed. */
  getSubgraphByName(name: string): ISubgraph | undefined {
    return (
      this.#findByName(this.coreSubgraphsMap, name) ??
      this.#findByName(this.subgraphs, name)
    );
  }

  /** Whether a registered subgraph has a live handler, i.e. whether
   * {@link executeSubgraphQuery} can reach it right now. */
  hasSubgraphHandler(name: string): boolean {
    return this.#internalSubgraphHandlers.has(name);
  }

  /** Run a query against one registered subgraph in-process: the subgraph's own
   * handler, without a socket or the auth/drive middleware. Trusted callers. */
  async executeSubgraphQuery<T>(
    subgraphName: string,
    query: string,
    variables: Record<string, unknown>,
  ): Promise<T> {
    const entry = this.#internalSubgraphHandlers.get(subgraphName);
    if (!entry) {
      throw new Error(
        this.getSubgraphByName(subgraphName)
          ? `Subgraph "${subgraphName}" is registered but has no handler yet`
          : `Subgraph "${subgraphName}" is not registered`,
      );
    }

    // Address the subgraph at its real mount path so resolvers and plugins that
    // read the request URL see what an external caller would.
    const url = new URL(entry.path, `http://localhost:${this.port}/`);
    const response = await entry.handler(
      new Request(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({ query, variables }),
      }),
    );
    if (!response.ok) {
      // Keep the body: Apollo reports validation failures as a 400 whose only
      // description of what went wrong is in there.
      const detail = await response.text().catch(() => "");
      throw new Error(
        `Subgraph "${subgraphName}" query failed: ${response.status}${
          detail ? ` ${detail}` : ""
        }`,
      );
    }

    const body = (await response.json()) as {
      data?: T;
      errors?: { message: string }[];
    };
    if (body.errors?.length) {
      throw new Error(body.errors.map((error) => error.message).join("; "));
    }
    if (!body.data) {
      throw new Error(`Subgraph "${subgraphName}" returned no data`);
    }
    return body.data;
  }

  updateRouter = debounce(this._updateRouter.bind(this), 1000);

  private async _updateRouter() {
    this.logger.debug("Updating router");

    await this.#setupSubgraphs(this.coreSubgraphsMap);
    await this.#setupSubgraphs(this.subgraphs);

    try {
      await this.gatewayAdapter.updateSupergraph();
      this.logger.debug("Updated Apollo Gateway supergraph");
    } catch (error) {
      reportFailure(
        this.#reporting,
        error,
        "Failed to update Apollo Gateway supergraph: @error",
      );
    }

    // Refresh the supergraph-level SSE handler so it picks up
    // any newly registered subscription-enabled subgraphs.
    const superGraphPath = path.posix.join(this.path, "graphql");
    this.#setupSupergraphSSE(superGraphPath);
  }

  getAdditionalContextFields = () => {
    return this.contextFields;
  };

  setAdditionalContextFields(fields: Record<string, any>) {
    this.contextFields = { ...this.contextFields, ...fields };
  }

  #makeContextFactory(): GatewayContextFactory<Context> {
    return (request: Request): Promise<Context> => {
      const authCtx = getAuthContext(request);
      const driveId = getRequestDriveId(request);
      const headers: IncomingHttpHeaders = {};
      request.headers.forEach((v, k) => {
        headers[k] = v;
      });
      return Promise.resolve<Context>({
        headers,
        db: this.relationalDb,
        ...this.getAdditionalContextFields(),
        driveId,
        user: authCtx?.user,
      });
    };
  }

  #makeWsContextFactory(): WsHandlers<Context> {
    return createWsAuthHandlers({
      authService: this.authService,
      credentialMonitor: this.#credentialMonitor,
      // Read at call time: init() installs this after the manager is built.
      requireAuthenticatedCaller: () =>
        this.#requireAuthMiddleware !== undefined,
      logger: this.logger,
      // `user` comes last, as in the HTTP context: no extra field supplies it.
      buildContext: (connectionParams, user) => ({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        headers: connectionParams as any,
        db: this.relationalDb,
        ...this.getAdditionalContextFields(),
        user,
      }),
    });
  }

  /** Replace the subgraphs of `supergraph` with `subgraphs`, under the same
   * name and type guards as any registration. */
  async setSupergraph(supergraph: string, subgraphs: ISubgraph[]) {
    await this.#serialize(async () => {
      // Its subgraphs are served under `graphql` too, as they always were.
      if (supergraph !== "" && !this.subgraphs.has("graphql")) {
        this.subgraphs.set("graphql", []);
      }
      let detached = false;
      for (const previous of [...(this.subgraphs.get(supergraph) ?? [])]) {
        if (!subgraphs.includes(previous)) {
          await this.#detachSubgraph(previous, this.#mountBuckets(supergraph));
          detached = true;
        }
      }
      for (const subgraph of subgraphs) {
        await this.#addSubgraphInstance(
          subgraph,
          supergraph,
          false,
          HOST_ORIGIN,
        );
      }
      if (detached) await this.#restorePackageSubgraphs();
    });
    return this.#refreshRouter();
  }

  async shutdown(): Promise<void> {
    this.logger.info("Shutting down GraphQL Manager");
    this.#credentialMonitor?.dispose();

    // Dispose per-subgraph WebSocket handlers before closing the WS server.
    for (const disposer of this.subgraphWsDisposers.values()) {
      await disposer.dispose();
    }
    this.subgraphWsDisposers.clear();

    // Stop all Apollo servers (per-subgraph + federation gateway) via the adapter.
    await this.gatewayAdapter.stop();

    return new Promise((resolve) => {
      this.wsServer.close(() => {
        this.logger.info("WebSocket server closed");
        resolve();
      });
    });
  }

  // The mount path is owned by the host: the manager's base path, never the
  // subgraph's own `path` field, which a package subgraph can overwrite with a
  // field initializer (it runs after super()).
  #getSubgraphPath(subgraph: ISubgraph, supergraph: string) {
    return path.posix.join(this.path, supergraph, subgraph.name);
  }

  /** The in-process handler map is keyed by bare name, so two distinct
   * subgraphs sharing one name would shadow each other: keep the first. */
  #setInternalSubgraphHandler(
    subgraph: ISubgraph,
    subgraphPath: string,
    handler: FetchHandler,
  ) {
    const existing = this.#internalSubgraphHandlers.get(subgraph.name);
    if (existing && existing.subgraph !== subgraph) {
      this.logger.warn(
        "Two subgraphs are named @name (@kept and @ignored); in-process queries keep the first",
        subgraph.name,
        existing.path,
        subgraphPath,
      );
      return;
    }
    this.#internalSubgraphHandlers.set(subgraph.name, {
      subgraph,
      path: subgraphPath,
      handler,
    });
  }

  async #setupSubgraphs(subgraphsMap: Map<string, ISubgraph[]>) {
    for (const [supergraph, subgraphs] of subgraphsMap.entries()) {
      for (const subgraph of subgraphs) {
        this.logger.debug(`Setting up subgraph ${subgraph.name}`);
        const subgraphPath = this.#getSubgraphPath(subgraph, supergraph);
        if (this.#isExcludedForTypes(subgraph)) {
          await this.#unmountSubgraph(subgraph, supergraph);
          continue;
        }
        try {
          // First mounted wins, unless it has since been unregistered.
          const cached = this.subgraphHandlerCache.get(subgraphPath);
          if (cached) {
            if (cached.subgraph === subgraph) {
              const current =
                cached.generated === this.#generated() ||
                !this.#usesModelTypes(subgraph);
              if (current) continue;
            } else if (this.#origins.has(cached.subgraph)) {
              this.logger.warn(
                "Subgraph path @path already mounted by @kept; @name is shadowed and will not be mounted",
                subgraphPath,
                cached.subgraph.name,
                subgraph.name,
              );
              continue;
            } else {
              await this.#unmountSubgraph(cached.subgraph, supergraph);
            }
          }

          const generated = this.#generated();
          const schema = createSchema(
            this.cachedDocumentModels,
            subgraph.resolvers,
            subgraph.typeDefs,
            this.#schemaOptions(subgraph),
          );

          const rawHandler = await this.gatewayAdapter.createHandler(
            schema,
            this.#makeContextFactory(),
          );
          // Superseded meanwhile: the update that change scheduled mounts it.
          if (!subgraphsMap.get(supergraph)?.includes(subgraph)) continue;
          if (generated !== this.#generated()) continue;
          const previous = this.subgraphHandlerCache.get(subgraphPath);
          if (
            previous?.subgraph === subgraph &&
            previous.generated === generated
          ) {
            continue;
          }
          if (previous) {
            await this.#unmountSubgraph(previous.subgraph, supergraph);
          }
          const fetchHandler = this.#composeFetchMiddleware(rawHandler);
          this.subgraphHandlerCache.set(subgraphPath, {
            handler: fetchHandler,
            subgraph,
            generated,
          });
          this.#setInternalSubgraphHandler(subgraph, subgraphPath, rawHandler);
          this.subgraphRouteHandles.set(
            subgraphPath,
            this.httpAdapter.mount(subgraphPath, fetchHandler),
          );

          if (subgraph.hasSubscriptions) {
            try {
              const existingDisposer =
                this.subgraphWsDisposers.get(subgraphPath);
              if (existingDisposer) {
                this.logger.warn(
                  "Overwriting existing WebSocket disposer for subgraph at path @path",
                  subgraphPath,
                );
              }
              const wsDisposer = this.gatewayAdapter.attachWebSocket(
                this.wsServer,
                schema,
                this.#makeWsContextFactory(),
              );
              this.subgraphWsDisposers.set(subgraphPath, wsDisposer);
              this.logger.debug(
                `WebSocket subscriptions enabled for ${subgraph.name}`,
              );
            } catch (error) {
              this.logger.error(
                "Failed to setup websocket for subgraph @name at path @path: @error",
                subgraph.name,
                subgraphPath,
                error,
              );
            }

            // Set up SSE (Server-Sent Events) transport alongside WebSocket.
            // Clients can use SSE by sending POST requests with
            // Accept: text/event-stream to the /stream sub-path.
            try {
              this.#setupSSEHandler(schema, subgraphPath);
              this.logger.debug(
                `SSE subscriptions enabled for ${subgraph.name}`,
              );
            } catch (error) {
              this.logger.error(
                "Failed to setup SSE for subgraph @name at path @path: @error",
                subgraph.name,
                subgraphPath,
                error,
              );
            }
          }
        } catch (error) {
          this.logger.error(
            "Failed to setup subgraph @name at path @path: @error",
            subgraph.name,
            subgraphPath,
            error,
          );
        }
      }
    }
  }

  #getAllSubgraphs() {
    const subgraphsMap = new Map<string, ISubgraph>();
    for (const [supergraph, subgraphs] of [
      ...this.coreSubgraphsMap.entries(),
      ...this.subgraphs.entries(),
    ]) {
      if (supergraph === "") {
        continue;
      }

      for (const subgraph of subgraphs) {
        const subgraphPath = this.#getSubgraphPath(subgraph, supergraph);
        // Core comes first and keeps its path.
        if (!subgraphsMap.has(subgraphPath)) {
          subgraphsMap.set(subgraphPath, subgraph);
        }
      }
    }
    return subgraphsMap;
  }

  /** Excluded subgraphs leave the supergraph only: their routes stay. */
  #getSupergraphSubgraphs(): Map<string, ISubgraph> {
    const members = new Map<string, ISubgraph>();
    for (const [subgraphPath, subgraph] of this.#getAllSubgraphs()) {
      if (!this.#isExcludedForTypes(subgraph)) {
        members.set(subgraphPath, subgraph);
      }
    }
    // A subgraph whose schema failed to build claims nothing.
    const built = new Set(
      Array.from(members)
        .filter(
          ([subgraphPath, subgraph]) =>
            this.subgraphHandlerCache.get(subgraphPath)?.subgraph === subgraph,
        )
        .map(([, subgraph]) => subgraph),
    );
    const losers = this.#claimLosers(built);
    for (const [subgraphPath, subgraph] of members) {
      if (losers.has(subgraph)) members.delete(subgraphPath);
    }
    return members;
  }

  /** Claims go by rank, then first registration; each exclusion logs once. */
  #claimLosers(subgraphs: ReadonlySet<ISubgraph>): Set<ISubgraph> {
    const priority = (subgraph: ISubgraph): number[] => {
      const origin = this.#originOf(subgraph);
      const order = this.#registrationOrder.get(origin);
      return [
        -rank(origin),
        order?.order ?? Infinity,
        order?.names.get(subgraph.name) ?? Infinity,
      ];
    };
    const ranked = Array.from(subgraphs, (subgraph) => ({
      subgraph,
      priority: priority(subgraph),
    })).sort((a, b) => {
      const i = a.priority.findIndex((value, j) => value !== b.priority[j]);
      return i === -1 ? 0 : a.priority[i] - b.priority[i];
    });
    const excluded = resolveClaimOwnership(
      ranked.map(({ subgraph }) => ({
        candidate: subgraph,
        name: subgraph.name,
        claims: this.#claimsOf(subgraph),
      })),
    );

    for (const subgraph of subgraphs) {
      const conflicts = excluded.get(subgraph);
      if (!conflicts) {
        this.#loggedOwnershipExclusions.delete(subgraph);
        continue;
      }
      const reason = describeOwnershipConflicts(conflicts);
      if (this.#loggedOwnershipExclusions.get(subgraph) !== reason) {
        this.#loggedOwnershipExclusions.set(subgraph, reason);
        this.logger.error(
          "Excluding subgraph @name from the supergraph: @error",
          subgraph.name,
          reason,
        );
      }
    }
    return new Set(excluded.keys());
  }

  #claimsOf(subgraph: ISubgraph): SubgraphClaims {
    const generated = this.#generated();
    const cached = this.#claims.get(subgraph);
    if (
      cached?.typeDefs === subgraph.typeDefs &&
      cached.generated === generated
    ) {
      return cached.claims;
    }
    let claims: SubgraphClaims;
    try {
      claims = collectSubgraphClaims(subgraph.typeDefs, generated.names);
    } catch {
      // Malformed typeDefs fail where the schema is built, and are logged there.
      claims = new Map();
    }
    this.#claims.set(subgraph, {
      typeDefs: subgraph.typeDefs,
      generated,
      claims,
    });
    return claims;
  }

  #buildSubgraphSchemaModule(subgraph: ISubgraph) {
    return buildSubgraphSchemaModule(
      this.cachedDocumentModels,
      subgraph.resolvers,
      subgraph.typeDefs,
      this.#schemaOptions(subgraph),
    );
  }

  #getSubgraphDefinitions(): SubgraphDefinition[] {
    const subgraphs = this.#getSupergraphSubgraphs();

    const herokuOrLocal = process.env.HEROKU_APP_DEFAULT_DOMAIN_NAME
      ? `https://${process.env.HEROKU_APP_DEFAULT_DOMAIN_NAME}`
      : `http://localhost:${this.port}`;

    const definitions: SubgraphDefinition[] = [];
    for (const [subgraphPath, subgraph] of subgraphs) {
      // One subgraph whose schema cannot be built must not take the
      // supergraph down with it.
      let module: ReturnType<typeof buildSubgraphSchemaModule>;
      try {
        module = this.#buildSubgraphSchemaModule(subgraph);
      } catch (error) {
        this.logger.error(
          "Excluding subgraph @name from the supergraph: @error",
          subgraph.name,
          error instanceof Error ? error.message : error,
        );
        continue;
      }
      definitions.push({
        name: subgraphPath.replace("/", ":"),
        typeDefs: module.typeDefs,
        // In-process form: the stitching adapter merges these resolvers into
        // the supergraph; federation adapters ignore the field.
        resolvers: module.resolvers,
        url: `${herokuOrLocal}${subgraphPath}`,
      });
    }
    return definitions;
  }

  async #createSupergraphGateway() {
    const superGraphPath = path.posix.join(this.path, "graphql");
    const rawHandler: FetchHandler =
      await this.gatewayAdapter.createSupergraphHandler(
        () => this.#getSubgraphDefinitions(),
        this.httpServer,
        this.#makeContextFactory(),
      );
    const fetchHandler = this.#composeFetchMiddleware(rawHandler);
    this.httpAdapter.mount(superGraphPath, fetchHandler);

    // Set up SSE subscriptions at the supergraph level (/graphql/stream).
    // Build a subscription schema from all subgraphs that define subscriptions.
    this.#setupSupergraphSSE(superGraphPath);

    if (!this.initialized) {
      this.logger.info(`Registered ${superGraphPath} supergraph `);
      this.initialized = true;
    }
    return;
  }

  #loggedSSEExclusions = new Set<string>();

  /**
   * Set up an SSE subscription endpoint at the supergraph level.
   * Merges the schemas of all subscription-enabled subgraphs so that
   * clients can subscribe at /graphql/stream without knowing individual
   * subgraph paths.
   */
  #setupSupergraphSSE(superGraphPath: string) {
    const definitions: SubgraphDefinition[] = [];
    for (const [subgraphPath, subgraph] of this.#getSupergraphSubgraphs()) {
      if (!subgraph.hasSubscriptions) continue;
      try {
        const module = this.#buildSubgraphSchemaModule(subgraph);
        definitions.push({
          name: subgraph.name,
          typeDefs: module.typeDefs,
          resolvers: module.resolvers,
          url: subgraphPath,
        });
      } catch (error) {
        this.logger.error(
          "Excluding subgraph @name from supergraph SSE: @error",
          subgraph.name,
          error instanceof Error ? error.message : error,
        );
      }
    }

    // Merged like the stitching supergraph, so subgraphs may share root types.
    // Each exclusion is logged once, not on every router update.
    const excluded = new Set<string>();
    const buildable = filterBuildableSubgraphs(
      withoutFederationDirectives(definitions),
      {
        error: (message: string) => {
          excluded.add(message);
          if (!this.#loggedSSEExclusions.has(message)) {
            this.logger.error(message);
          }
        },
      },
      "Supergraph SSE",
    );
    this.#loggedSSEExclusions = excluded;

    try {
      const mergedSchema = mergeStreamSubgraphs(buildable);
      if (mergedSchema === undefined) {
        // Nothing left contributes a Query root: drop the SSE route rather
        // than serve an empty or invalid schema.
        this.#disposeSSERoute(superGraphPath);
        return;
      }
      this.#setupSSEHandler(mergedSchema, superGraphPath);
      this.logger.debug(
        `SSE subscriptions enabled at supergraph level (merged from ${buildable.length} subgraph(s))`,
      );
    } catch (error) {
      this.logger.error("Failed to setup supergraph SSE: @error", error);
    }
  }

  /**
   * Set up a GraphQL-over-SSE handler at `<basePath>/stream`.
   *
   * Clients subscribe by sending a POST with `Accept: text/event-stream`
   * to the `/stream` sub-path. Authentication is handled by the normal
   * Express middleware (Authorization header), unlike WebSocket which
   * needs its own connectionParams-based auth.
   */
  #setupSSEHandler(schema: GraphQLSchema, basePath: string) {
    const ssePath = basePath + "/stream";
    const rawHandler = createGraphQLSSEHandler({
      schema,
      contextFactory: this.#makeContextFactory(),
    });
    const handler = this.#composeFetchMiddleware(rawHandler);
    // Re-created on every router update: replace this path's previous route
    // rather than pile another on top of it, and leave other paths' alone.
    this.#disposeSSERoute(basePath);
    this.sseRouteHandles.set(
      ssePath,
      this.httpAdapter.mount(ssePath, handler, { exact: true }),
    );
  }

  #disposeSSERoute(basePath: string): void {
    const ssePath = basePath + "/stream";
    const handle = this.sseRouteHandles.get(ssePath);
    if (handle !== undefined) {
      handle.dispose();
      this.sseRouteHandles.delete(ssePath);
    }
  }

  /**
   * Compose the request-level fetch middleware chain. Auth runs first
   * (so we don't validate shard before knowing the request is even
   * authorized); the require-authenticated-caller middleware runs next,
   * before shard validation, so an anonymous caller is rejected with a
   * 401 rather than a 421; drive-ownership validation runs last.
   */
  #composeFetchMiddleware(rawHandler: FetchHandler): FetchHandler {
    let handler = rawHandler;
    if (this.#driveMiddleware) {
      handler = this.#driveMiddleware(handler);
    }
    if (this.#requireAuthMiddleware) {
      handler = this.#requireAuthMiddleware(handler);
    }
    if (this.#authMiddleware) {
      handler = this.#authMiddleware(handler);
    }
    return handler;
  }
}
