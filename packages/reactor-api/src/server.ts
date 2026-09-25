import type { PGlite } from "@electric-sql/pglite";
import type { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import { PostgresAnalyticsStore } from "@powerhousedao/analytics-engine-pg";
import { getConfig } from "@powerhousedao/config/node";
import type {
  IDocumentModelRegistry,
  IDriveClient,
  IReadModel,
  IReactorClient,
  InProcessReactorModule,
  IProcessorManager as IReactorProcessorManager,
  ISyncManager,
  InProcessReactorClientModule,
  ProcessorRecord as ReactorProcessorRecord,
} from "@powerhousedao/reactor";
import {
  ModelReadGate,
  readDecisionModel,
  SyncScopeGate,
} from "@powerhousedao/reactor";
import {
  AttachmentBuilder,
  AttachmentReferenceIndexBuilder,
} from "@powerhousedao/reactor-attachments";
import type {
  AttachmentBuildResult,
  AttachmentDatabase,
  AttachmentReferenceIndexBuildResult,
  IAttachmentReferenceWriter,
} from "@powerhousedao/reactor-attachments";
import { createAttachmentClient } from "@powerhousedao/reactor-attachments/client";
import { setupMcpServer } from "@powerhousedao/reactor-mcp";
import type {
  DocumentModelModule,
  UpgradeManifest,
} from "@powerhousedao/shared/document-model";
import type { Kysely } from "kysely";
import { mkdir } from "node:fs/promises";
import type http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Pool } from "pg";
import { WebSocketServer } from "ws";
import { createReactorHostModuleBase } from "@powerhousedao/reactor";
import {
  createRelationalDb,
  type IRelationalDb,
  type ProcessorApp,
  type ProcessorFactory,
} from "@powerhousedao/shared/processors";
import { childLogger, type ILogger } from "document-model";
import { config, DefaultCoreSubgraphs } from "./config.js";
import { createStartupAttachmentBackend } from "./attachment-backend.js";
import {
  AttachmentAccessService,
  type AttachmentReferenceProjectionCapability,
  type IAttachmentAccessService,
} from "./services/attachment-access.service.js";
import { createCanonicalDocumentIdResolver } from "./services/canonical-document-id.js";
import { AuthSubgraph } from "./graphql/auth/subgraph.js";
import {
  createAuthFetchMiddleware,
  type AuthFetchMiddleware,
} from "./graphql/gateway/auth-middleware.js";
import {
  createGatewayAdapter,
  createHttpAdapter,
  type GatewayAdapterType,
} from "./graphql/gateway/factory.js";
import {
  createRequireAuthFetchMiddleware,
  type RequireAuthFetchMiddleware,
} from "./graphql/gateway/require-auth-middleware.js";
import type { IHttpAdapter, TlsOptions } from "./graphql/gateway/types.js";
import { GraphQLManager } from "./graphql/graphql-manager.js";
import {
  CORE_PACKAGE_NAME,
  HttpRouteService,
  RelationalWebhookStore,
  WEBHOOK_SEGMENT,
  WebhookService,
} from "./http/index.js";
import {
  decodeExplorerUrlState,
  renderGraphqlPlayground,
} from "./graphql/playground.js";
import { ReactorSubgraph } from "./graphql/reactor/subgraph.js";
import type { SubgraphClass } from "./graphql/types.js";
import { runMigrations } from "./migrations/index.js";
import { ImportPackageLoader } from "./packages/import-loader.js";
import {
  getUniqueDocumentModels,
  PackageManager,
} from "./packages/package-manager.js";
import {
  AuthService,
  type CredentialVerifier,
} from "./services/auth.service.js";
import { createRenownCredentialVerifier } from "./services/renown-credential-verifier.js";
import type {
  AuthorizationConfig,
  IAuthorizationService,
} from "./services/authorization.service.js";
import {
  AuthorizationPolicy,
  createAuthorizationService,
} from "./services/authorization.service.js";
import { DocumentPermissionService } from "./services/document-permission.service.js";
import { createGetParentIdsFn } from "./services/get-parent-ids.js";
import { createMcpRequestAuthorizer } from "./services/mcp-request-authorizer.js";
import {
  assertCredentialVerifierForSource,
  resolveRenownConfig,
  type RenownConfig,
  type ResolvedRenownConfig,
} from "./services/renown-config.js";
import type {
  API,
  IPackageLoader,
  IProcessorHostModule,
  Processor,
  ProcessorFactoryBuilder,
  ReadinessGate,
} from "./types.js";
import {
  getDbClient,
  initAnalyticsStoreSql,
  type DocumentPermissionDatabase,
  type PgliteFactory,
} from "./utils/db.js";

const defaultLogger = childLogger(["reactor-api", "server"]);

type Options = {
  port?: number;
  dbPath: string | undefined;
  client?: PGlite | typeof Pool | undefined;
  /**
   * Factory for the PGLite instance backing the read-model store. When set,
   * `getDbClient` uses it instead of constructing `new PGlite(dbPath)`. Used
   * by Switchboard to keep a legacy-version data dir readable while running
   * the newer Switchboard binary.
   */
  pgliteFactory?: PgliteFactory;
  configFile?: string;
  packages?: string[];
  auth?: {
    enabled: boolean;
    admins: string[];
    /** Read the bearer and populate `ctx.user` independently of `enabled`.
     *  Defaults to `enabled`; `RESOLVE_CALLER_IDENTITY` overrides either. */
    resolveIdentity?: boolean;
    /** Reject anonymous callers with a 401 before any subgraph sees the
     *  request. Off by default; `REQUIRE_AUTHENTICATED_CALLER` overrides.
     *  Requires identity resolution to be on — refused at boot without it. */
    requireAuthenticatedCaller?: boolean;
    /** Mounted paths that stay reachable anonymously while
     *  `requireAuthenticatedCaller` is on, for a flow that runs before
     *  sign-in. Matched against the request's pathname in full, never as a
     *  prefix. `REQUIRE_AUTHENTICATED_CALLER_EXEMPT_PATHS` overrides, as a
     *  comma-separated list. Each entry is a hole in the floor: only ever name
     *  a path serving operations that are safe without a caller. */
    requireAuthenticatedCallerExemptPaths?: string[];
    /** Decide an attachment read with the referencing document's own policy
     *  instead of the host permission tables. Off by default;
     *  `ATTACHMENT_READS_FOLLOW_DOCUMENT_POLICY` overrides. Requires auth
     *  enforcement, which is what supplies the model — refused at boot
     *  without it. */
    attachmentReadsFollowDocumentPolicy?: boolean;
  };
  /** Renown coordinates the host already resolved, used verbatim instead of
   * resolving `auth.renown` and the env again (which would warn twice). */
  renown?: ResolvedRenownConfig;
  /** Credential check replacing the built-in remote Renown one; required when
   * the resolved source is "self" (see assertCredentialVerifierForSource). */
  verifyCredential?: CredentialVerifier;
  https?:
    | {
        keyPath: string;
        certPath: string;
      }
    | boolean
    | undefined;
  packageLoaders?: IPackageLoader[];
  processors?: Record<string, ProcessorInitializer[]>;
  mcp?: boolean;
  processorConfig?: Map<string, unknown>;
  /**
   * Document permission service instance.
   * When provided, the Auth subgraph is registered and document permission
   * checks are enforced on document operations.
   * If not provided, can be auto-created by setting DOCUMENT_PERMISSIONS_ENABLED=true
   * environment variable.
   */
  documentPermissionService?: DocumentPermissionService;
  enableDocumentModelSubgraphs?: boolean;
  logger?: ILogger;
  /**
   * Filesystem path for attachment binary storage.
   * Defaults to a sibling "attachments" directory next to dbPath,
   * or os.tmpdir() for in-memory DB deployments.
   */
  attachmentStoragePath?: string;
};

type ProcessorInitializer = ProcessorFactoryBuilder;

const DEFAULT_PORT = 4000;

/**
 * Doc-perms require auth: with auth off no `user` is ever resolved, so every
 * authorization check fails closed. Refuse to boot rather than run broken.
 */
export function assertAuthRequiredForDocumentPermissions(
  authEnabled: boolean,
  documentPermissionsRequested: boolean,
): void {
  if (!authEnabled && documentPermissionsRequested) {
    throw new Error(
      "Document permissions require authentication: AUTH_ENABLED is false but " +
        "document permissions were requested (DOCUMENT_PERMISSIONS_ENABLED=true " +
        "or a documentPermissionService was provided). Enable authentication " +
        "(AUTH_ENABLED=true, or auth.enabled in the config file) or disable " +
        "document permissions.",
    );
  }
}

/**
 * Refuses SKIP_CREDENTIAL_VERIFICATION at boot outside tests or an explicit
 * opt-in: it removes the only binding between a token's claimed address and its
 * signing key. Fail-closed — unset NODE_ENV counts as production.
 */
export function assertSkipCredentialVerificationAllowed(
  resolvesCallerIdentity: boolean,
  skipCredentialVerification: boolean,
  env: NodeJS.ProcessEnv,
): void {
  if (!resolvesCallerIdentity || !skipCredentialVerification) {
    return;
  }
  const inAutomatedTest = env.VITEST === "true" || env.NODE_ENV === "test";
  const acknowledged =
    env.ALLOW_INSECURE_SKIP_CREDENTIAL_VERIFICATION === "true";
  if (!inAutomatedTest && !acknowledged) {
    throw new Error(
      "SKIP_CREDENTIAL_VERIFICATION is set but refused: it disables the live " +
        "Renown credential check — the only check binding a token's claimed " +
        "address to the key that signed it — so honoring it allows identity " +
        "spoofing, including of admins. It is never safe in production. For " +
        "local or sandbox use, also set " +
        "ALLOW_INSECURE_SKIP_CREDENTIAL_VERIFICATION=true to acknowledge the " +
        "risk; automated test runs (VITEST=true or NODE_ENV=test) are exempt.",
    );
  }
}

/**
 * Requiring an authenticated caller requires identity resolution to exist at
 * all: with neither AUTH_ENABLED nor RESOLVE_CALLER_IDENTITY the middleware
 * never reads a bearer, no `user` is ever resolved, and the
 * require-authenticated-caller middleware would reject every caller —
 * authenticated ones included. Refuse to boot rather than run broken.
 */
export function assertRequireAuthenticatedCallerAllowed(
  requireAuthenticatedCaller: boolean,
  resolvesCallerIdentity: boolean,
  exemptPaths: readonly string[] = [],
): void {
  /**
   * An exemption is only ever a hole in this floor, so configuring one while
   * the floor is off is not a harmless no-op: it reads, to anyone auditing the
   * configuration, as a surface that was deliberately opened — and therefore
   * as a floor that exists. Refuse rather than let the two drift.
   */
  if (!requireAuthenticatedCaller && exemptPaths.length > 0) {
    throw new Error(
      "REQUIRE_AUTHENTICATED_CALLER_EXEMPT_PATHS is set but refused: " +
        "REQUIRE_AUTHENTICATED_CALLER is off, so nothing is being exempted " +
        "from anything and the configuration claims a protection the server " +
        "is not applying. Enable the floor, or drop the exemptions.",
    );
  }

  /**
   * A path that cannot match anything is worse than no path: the operator
   * believes the flow is reachable, and finds out when the first user cannot
   * claim an invitation. `URL.pathname` is always absolute, so an entry that
   * does not start with `/` never matches, whatever the router does.
   */
  const relative = exemptPaths.filter((path) => !path.trim().startsWith("/"));
  if (relative.length > 0) {
    throw new Error(
      `REQUIRE_AUTHENTICATED_CALLER_EXEMPT_PATHS contains ${relative
        .map((path) => `"${path}"`)
        .join(", ")}, which cannot match: an exempt path is compared against ` +
        "the request's pathname and must start with '/' (for example " +
        "'/graphql/public').",
    );
  }

  if (!requireAuthenticatedCaller || resolvesCallerIdentity) {
    return;
  }
  throw new Error(
    "REQUIRE_AUTHENTICATED_CALLER is set but refused: it rejects every " +
      "request without a resolved caller, and with neither AUTH_ENABLED nor " +
      "RESOLVE_CALLER_IDENTITY the server never reads a bearer, so it would " +
      "reject every caller, including authenticated ones. Enable identity " +
      "resolution first (RESOLVE_CALLER_IDENTITY=true or AUTH_ENABLED=true).",
  );
}

/**
 * Deciding an attachment read by the document's policy needs a policy model to
 * decide with, and that is what auth enforcement supplies. Without one there is
 * nothing to consult, so the setting would silently leave the permission tables
 * in charge — configuration that describes a protection the server is not
 * applying, which is worse than no configuration at all. Refuse instead.
 */
export function assertAttachmentPolicyReadsAllowed(
  attachmentReadsFollowDocumentPolicy: boolean,
  hasDecisionModel: boolean,
): void {
  if (!attachmentReadsFollowDocumentPolicy || hasDecisionModel) {
    return;
  }
  throw new Error(
    "ATTACHMENT_READS_FOLLOW_DOCUMENT_POLICY is set but refused: deciding an " +
      "attachment read by the referencing document's policy requires a policy " +
      "model to evaluate, and this composition has none, so the host " +
      "permission tables would keep deciding while the configuration says " +
      "otherwise. Enable auth enforcement first (REACTOR_AUTH_ENFORCEMENT=true).",
  );
}

function createReadinessGate(): ReadinessGate {
  let ready = false;
  return {
    isReady: () => ready,
    markReady: () => {
      ready = true;
    },
  };
}

/**
 * The GraphiQL explorer page's mount prefix. `path.posix.join` normalizes the
 * join with `basePath` — a naive template literal would produce `//explorer`
 * for the default `/` basePath, which express compiles into a route that only
 * matches `//explorer`, leaving `GET /explorer` a 404.
 */
export function getExplorerPrefix(basePath: string): string {
  return path.posix.join(basePath, "explorer");
}

function resolveAttachmentStoragePath(options: Options): string {
  if (options.attachmentStoragePath) return options.attachmentStoragePath;
  if (options.dbPath && !options.dbPath.startsWith("postgres")) {
    return path.resolve(options.dbPath, "..", "attachments");
  }
  return path.join(tmpdir(), "reactor-attachments");
}

/**
 * Initializes the database and analytics store. The returned `closers` are
 * idempotent thunks that release the underlying knex pool and PGlite instance
 * (when on-disk PGlite is in use); callers are expected to run them as part
 * of API teardown so PGlite WAL is flushed and the data-dir lock is released.
 */
async function initializeDatabaseAndAnalytics(
  dbPath: string | undefined,
  pgliteFactory: PgliteFactory | undefined,
): Promise<{
  relationalDb: IRelationalDb;
  analyticsStore: IAnalyticsStore;
  closers: Array<() => Promise<void>>;
}> {
  const { db, knex, pglite } = getDbClient(dbPath, pgliteFactory);
  const relationalDb = createRelationalDb<unknown>(db);
  const analyticsStore = new PostgresAnalyticsStore({
    knex,
  });

  for (const sql of initAnalyticsStoreSql) {
    await knex.raw(sql);
  }

  return {
    relationalDb,
    analyticsStore,
    closers: makeDbClosers(knex, pglite),
  };
}

/**
 * Builds best-effort closers for a knex/PGlite pair returned by
 * {@link getDbClient}. Order is significant: knex first releases its pool
 * (which is what the application talks to), then PGlite flushes WAL and
 * unlocks the data dir.
 */
function makeDbClosers(
  knexInstance: { destroy: () => Promise<void> },
  pglite: PGlite | undefined,
): Array<() => Promise<void>> {
  const closers: Array<() => Promise<void>> = [() => knexInstance.destroy()];
  if (pglite) {
    closers.push(async () => {
      if (!pglite.closed) await pglite.close();
    });
  }
  return closers;
}

/**
 * The gate sync serving evaluates a document's own policy through, or undefined
 * when there is none to evaluate.
 *
 * It is built here rather than taken off the reactor client because it is not
 * the same gate reads use: it carries the host's closes-by-default setting,
 * which withholds the domain scopes of a document nobody has policied yet. That
 * answer belongs to serving alone -- replay must keep reading an uninitialized
 * document in full -- so the two gates are deliberately separate objects over
 * the same model.
 *
 * Undefined below `authEnforcement`, where the registered model ignores the auth
 * scope: gating through it would serve every domain scope of a policied document
 * to anyone, which is worse than not gating at all.
 */
function buildSyncServingGate(
  reactorModule: InProcessReactorModule | undefined,
  authorizationConfig: AuthorizationConfig,
  logger: ILogger,
): SyncScopeGate | undefined {
  if (!reactorModule) {
    return undefined;
  }

  const model = readDecisionModel(
    reactorModule.featureFlags,
    reactorModule.documentModelRegistry,
  );
  if (!model) {
    return undefined;
  }

  return new SyncScopeGate(
    new ModelReadGate(
      model,
      reactorModule.documentView,
      reactorModule.featureFlags.authGroups,
      reactorModule.operationIndex,
      logger,
      { withholdUninitialized: authorizationConfig.defaultProtection },
    ),
    reactorModule.documentView,
    logger,
  );
}
/**
 * Resolves the gateway adapter type from the `GATEWAY_ADAPTER` env var.
 * Defaults to "apollo" (the federation gateway, production behavior).
 * "stitching" selects the in-process graphql-tools merge gateway (#1565
 * prototype); "mercurius" the Fastify federation gateway.
 */
function resolveGatewayAdapterType(logger: ILogger): GatewayAdapterType {
  const configured = process.env.GATEWAY_ADAPTER;
  if (configured === undefined) {
    return "apollo";
  }
  if (
    configured === "apollo" ||
    configured === "mercurius" ||
    configured === "stitching"
  ) {
    return configured;
  }
  logger.warn(
    `Unknown GATEWAY_ADAPTER="${configured}"; falling back to "apollo"`,
  );
  return "apollo";
}

/**
 * Sets up the subgraph manager and registers subgraphs
 */
async function setupGraphQLManager(
  httpAdapter: IHttpAdapter,
  authFetchMiddleware: AuthFetchMiddleware | undefined,
  requireAuthFetchMiddleware: RequireAuthFetchMiddleware | undefined,
  httpServer: http.Server,
  wsServer: WebSocketServer,
  client: IReactorClient,
  relationalDb: IRelationalDb,
  analyticsStore: IAnalyticsStore,
  syncManager: ISyncManager,
  subgraphs: {
    extended: Map<string, SubgraphClass[]>;
    core: SubgraphClass[];
  },
  logger: ILogger,
  authorizationService: IAuthorizationService,
  authService?: AuthService,
  documentPermissionService?: DocumentPermissionService,
  enableDocumentModelSubgraphs?: boolean,
  port?: number,
  reactorDriveClient?: IDriveClient,
  syncServingGate?: SyncScopeGate,
  httpRoutes?: HttpRouteService,
): Promise<GraphQLManager> {
  const graphqlManager = new GraphQLManager(
    config.basePath,
    httpServer,
    wsServer,
    client,
    relationalDb,
    analyticsStore,
    syncManager,
    logger,
    httpAdapter,
    await createGatewayAdapter(resolveGatewayAdapterType(logger), logger),
    authService,
    documentPermissionService,
    {
      enableDocumentModelSubgraphs,
    },
    port,
    authorizationService,
    reactorDriveClient,
    syncServingGate,
    httpRoutes,
  );

  await graphqlManager.init(
    subgraphs.core,
    authFetchMiddleware,
    requireAuthFetchMiddleware,
  );

  for (const [packageName, collection] of subgraphs.extended.entries()) {
    for (const subgraph of collection) {
      await graphqlManager.registerSubgraph(
        subgraph,
        "graphql",
        false,
        packageName,
      );
    }
  }

  await graphqlManager.updateRouter();

  return graphqlManager;
}

/**
 * Sets up event listeners for package manager changes
 */
function setupEventListeners(
  pkgManager: PackageManager,
  graphqlManager: GraphQLManager,
  reactorProcessorManager: IReactorProcessorManager,
  moduleFor: (packageName: string) => IProcessorHostModule,
  documentModelRegistry?: IDocumentModelRegistry,
): void {
  pkgManager.onDocumentModelsChange((packagedModels) => {
    if (documentModelRegistry) {
      // Replace each incoming type's whole version family: skipping types
      // that are already registered would never pick up a new version of a
      // versioned model (or regenerated code for an existing one), and
      // unregisterModules is type-scoped so partial re-registration would
      // drop sibling versions.
      const newModules = getUniqueDocumentModels(
        Object.values(packagedModels).flat(),
      );
      const incomingTypes = new Set(
        newModules.map((m) => m.documentModel.global.id),
      );
      if (incomingTypes.size > 0) {
        documentModelRegistry.unregisterModules(...incomingTypes);
        const results = documentModelRegistry.registerModules(...newModules);
        for (const result of results) {
          if (result.status === "success") {
            defaultLogger.info(
              `Registered document model: ${result.item.documentModel.global.id} v${result.item.version ?? 1}`,
            );
          } else {
            defaultLogger.error(
              `Failed to register document model: ${result.error.message}`,
            );
          }
        }
      }

      // Manifests change together with document models (they live under the
      // same document-models/ tree), so swap them here as well.
      const manifests = pkgManager.getUniqueUpgradeManifests();
      if (manifests.length > 0) {
        documentModelRegistry.unregisterUpgradeManifests(
          ...manifests.map((m) => m.documentType),
        );
        const manifestResults = documentModelRegistry.registerUpgradeManifests(
          ...manifests,
        );
        for (const result of manifestResults) {
          if (result.status === "error") {
            defaultLogger.error(
              `Failed to register upgrade manifest: ${result.error.message}`,
            );
          }
        }
      }
    }
    void graphqlManager.regenerateDocumentModelSubgraphs();
  });

  let knownSubgraphPackages = new Set<string>();
  pkgManager.onSubgraphsChange((packagedSubgraphs) => {
    void (async () => {
      for (const [packageName, subgraphs] of packagedSubgraphs) {
        const incomingNames = new Set<string>();
        for (const subgraph of subgraphs) {
          const instance = await graphqlManager.registerSubgraph(
            subgraph,
            "graphql",
            false,
            packageName,
          );
          // Registration returns undefined when the subgraph is rejected
          // (e.g. its name is reserved by a core subgraph, issue #2972).
          // Nothing was mounted, so the name is not provided and must not
          // shield a stale same-named subgraph from being pruned below.
          if (!instance) {
            continue;
          }
          incomingNames.add(instance.name);
        }
        // The package is still loaded but dropped some (or all) of its
        // subgraphs: tear down the ones it no longer provides.
        await graphqlManager.prunePackageSubgraphs(packageName, incomingNames);
      }
      // A package that vanished from the map entirely (uninstalled or
      // removed from the config) keeps none of its subgraphs.
      for (const packageName of knownSubgraphPackages) {
        if (!packagedSubgraphs.has(packageName)) {
          await graphqlManager.unregisterPackage(packageName);
        }
      }
      knownSubgraphPackages = new Set(packagedSubgraphs.keys());
      await graphqlManager.updateRouter();
    })();
  });

  let knownProcessorPackages = new Set<string>();
  pkgManager.onProcessorsChange((processors) => {
    void (async () => {
      // Packages that vanished from the map entirely keep none of their
      // factories: unregister the leftovers.
      for (const packageName of knownProcessorPackages) {
        if (!processors.has(packageName)) {
          await reactorProcessorManager.unregisterFactory(packageName);
        }
      }
      knownProcessorPackages = new Set(processors.keys());

      for (const [packageName, fns] of processors) {
        await reactorProcessorManager.unregisterFactory(packageName);

        const factories = fns.map((fn) => fn(moduleFor(packageName)));

        const validBuilders = factories.filter(
          (factory): factory is ProcessorFactory =>
            typeof factory === "function",
        );

        if (!validBuilders.length) {
          continue;
        }

        await reactorProcessorManager.registerFactory(
          packageName,
          async (driveHeader) =>
            (
              await Promise.all(
                validBuilders.map(async (driveFactory) => {
                  try {
                    const result = await driveFactory(driveHeader);
                    return result as unknown as ReactorProcessorRecord[];
                  } catch (e) {
                    const logger = defaultLogger;
                    logger.error(
                      `Error creating processor for drive ${driveHeader.id}:`,
                      e,
                    );
                    return [];
                  }
                }),
              )
            ).flat(),
        );
      }
    })();
  });
}

/**
 * Starts the server (HTTP or HTTPS) and attaches WebSocket server
 */
async function startServer(
  httpAdapter: IHttpAdapter,
  port: number,
  httpsOptions: Options["https"],
  logger: ILogger,
): Promise<{ httpServer: http.Server; wsServer: WebSocketServer }> {
  const tls: TlsOptions | undefined =
    httpsOptions === true
      ? true
      : typeof httpsOptions === "object"
        ? { keyPath: httpsOptions.keyPath, certPath: httpsOptions.certPath }
        : undefined;

  const httpServer = await httpAdapter.listen(port, tls);

  const wsServer = new WebSocketServer({
    server: httpServer,
    path: "/graphql/subscriptions",
  });

  logger.info("WebSocket server available at /graphql/subscriptions");

  return { httpServer, wsServer };
}

/**
 * Private helper function that sets up common infrastructure before API initialization.
 * This includes auth configuration, database setup, and package manager initialization.
 */
async function _setupCommonInfrastructure(options: Options): Promise<{
  port: number;
  httpAdapter: IHttpAdapter;
  authFetchMiddleware: AuthFetchMiddleware | undefined;
  requireAuthFetchMiddleware: RequireAuthFetchMiddleware | undefined;
  authService: AuthService | undefined;
  relationalDb: IRelationalDb;
  analyticsStore: IAnalyticsStore;
  documentPermissionService: DocumentPermissionService | undefined;
  authorizationConfig: AuthorizationConfig;
  attachments: AttachmentBuildResult;
  attachmentReferenceIndex: AttachmentReferenceIndexBuildResult;
  packages: PackageManager;
  dbClosers: Array<() => Promise<void>>;
  readiness: ReadinessGate;
  httpRoutes: HttpRouteService;
  attachmentReadsFollowDocumentPolicy: boolean;
}> {
  const port = options.port ?? DEFAULT_PORT;
  const { adapter: httpAdapter } = await createHttpAdapter("express");
  const logger = options.logger ?? defaultLogger;

  // Setup auth configuration
  let admins: string[] = [];
  let authEnabled = false;
  let configuredResolveIdentity: boolean | undefined;
  let configuredRequireAuth: boolean | undefined;
  let configuredExemptPaths: string[] | undefined;
  let configuredAttachmentPolicyReads: boolean | undefined;
  let configuredRenown: RenownConfig | undefined;
  if (options.configFile) {
    const config = getConfig(options.configFile);
    admins = config.auth?.admins.map((a) => a.toLowerCase()) ?? [];
    authEnabled = config.auth?.enabled ?? false;
    configuredRenown = config.auth?.renown;
  } else if (options.auth) {
    admins = options.auth.admins.map((a) => a.toLowerCase());
    authEnabled = options.auth.enabled;
    configuredResolveIdentity = options.auth.resolveIdentity;
    configuredRequireAuth = options.auth.requireAuthenticatedCaller;
    configuredExemptPaths = options.auth.requireAuthenticatedCallerExemptPaths;
    configuredAttachmentPolicyReads =
      options.auth.attachmentReadsFollowDocumentPolicy;
  }
  const {
    AUTH_ENABLED,
    RESOLVE_CALLER_IDENTITY,
    REQUIRE_AUTHENTICATED_CALLER,
    REQUIRE_AUTHENTICATED_CALLER_EXEMPT_PATHS,
    ATTACHMENT_READS_FOLLOW_DOCUMENT_POLICY,
    ADMINS,
    DEFAULT_PROTECTION,
    DOCUMENT_PERMISSIONS_ENABLED,
    SKIP_CREDENTIAL_VERIFICATION,
    CREDENTIAL_VERIFICATION_CACHE_TTL_MS,
  } = process.env;
  if (AUTH_ENABLED !== undefined) {
    authEnabled = AUTH_ENABLED === "true";
  }

  /**
   * Whether the auth middleware reads the bearer and populates `ctx.user`,
   * independently of the authorization policy.
   *
   * Defaults to `authEnabled`, so a deployment that never sets it behaves
   * exactly as it did: auth on means the token is read AND the policy is
   * `ADMIN_ONLY`; auth off means neither. Setting it explicitly is what
   * separates the two — a server can then know who is calling while the policy
   * stays `OPEN`, which is the combination custom subgraphs need and the one
   * `AUTH_ENABLED` alone cannot express.
   */
  let resolveCallerIdentity = configuredResolveIdentity ?? authEnabled;
  if (RESOLVE_CALLER_IDENTITY !== undefined) {
    resolveCallerIdentity = RESOLVE_CALLER_IDENTITY === "true";
  }

  /**
   * Whether the require-authenticated-caller middleware is active: anonymous
   * callers are rejected with a 401 before any subgraph sees the request.
   *
   * Off by default, so nothing changes for existing deployments. This is the
   * enforcement half of the `RESOLVE_CALLER_IDENTITY` split: that one lets a
   * server know who is calling while the policy stays `OPEN`, and this one
   * closes the hole it leaves open — under `OPEN`, an anonymous caller
   * reaches the whole generic surface (document CRUD, sync, every custom
   * subgraph), because `OpenAuthorizationService` answers `true` to
   * everything. `ADMIN_ONLY` is the only alternative today, and it locks
   * out every non-admin; this expresses "authenticated callers allowed,
   * anonymous not".
   */
  let requireAuthenticatedCaller = configuredRequireAuth ?? false;
  if (REQUIRE_AUTHENTICATED_CALLER !== undefined) {
    requireAuthenticatedCaller = REQUIRE_AUTHENTICATED_CALLER === "true";
  }

  /**
   * The paths the floor above does not apply to. Comma-separated, like
   * `ADMINS`, because a deployment configures this the same way it configures
   * everything else: one variable, one line, however many values it has.
   *
   * Empty entries are dropped rather than refused, so a trailing comma or a
   * value split across lines in a manifest is not a boot failure; a value that
   * cannot ever match is refused, in
   * {@link assertRequireAuthenticatedCallerAllowed}.
   */
  let requireAuthenticatedCallerExemptPaths = configuredExemptPaths ?? [];
  if (REQUIRE_AUTHENTICATED_CALLER_EXEMPT_PATHS !== undefined) {
    requireAuthenticatedCallerExemptPaths =
      REQUIRE_AUTHENTICATED_CALLER_EXEMPT_PATHS.split(",")
        .map((path) => path.trim())
        .filter((path) => path.length > 0);
  }

  /**
   * Whether an attachment read is decided by the referencing document's own
   * policy rather than by the host's permission tables.
   *
   * Off by default, and a deployment's choice rather than something derived
   * from the flags around it. Which model governs those bytes is configuration
   * in the same sense the storage backend behind them is: a host that has said
   * nothing keeps exactly the behaviour it has, and one that wants the change
   * asks for it and can take it back without disturbing anything else.
   */
  let attachmentReadsFollowDocumentPolicy =
    configuredAttachmentPolicyReads ?? false;
  if (ATTACHMENT_READS_FOLLOW_DOCUMENT_POLICY !== undefined) {
    attachmentReadsFollowDocumentPolicy =
      ATTACHMENT_READS_FOLLOW_DOCUMENT_POLICY === "true";
  }

  if (ADMINS !== undefined) {
    admins = ADMINS.split(",").map((a) => a.toLowerCase());
  }

  let defaultProtection = false;
  if (DEFAULT_PROTECTION !== undefined) {
    defaultProtection = DEFAULT_PROTECTION.toLowerCase() === "true";
  }

  let skipCredentialVerification = false;
  if (SKIP_CREDENTIAL_VERIFICATION !== undefined) {
    skipCredentialVerification = SKIP_CREDENTIAL_VERIFICATION === "true";
  }

  let credentialVerificationCacheTtlMs: number | undefined;
  if (CREDENTIAL_VERIFICATION_CACHE_TTL_MS !== undefined) {
    const parsed = Number(CREDENTIAL_VERIFICATION_CACHE_TTL_MS);
    if (
      CREDENTIAL_VERIFICATION_CACHE_TTL_MS.trim() !== "" &&
      Number.isFinite(parsed) &&
      parsed >= 0
    ) {
      credentialVerificationCacheTtlMs = parsed;
    } else {
      logger.warn(
        `Ignoring invalid CREDENTIAL_VERIFICATION_CACHE_TTL_MS="${CREDENTIAL_VERIFICATION_CACHE_TTL_MS}" (expected a non-negative number of milliseconds; 0 disables caching) — using the default TTL`,
      );
    }
  }

  const documentPermissionsRequested =
    options.documentPermissionService !== undefined ||
    DOCUMENT_PERMISSIONS_ENABLED === "true";
  assertAuthRequiredForDocumentPermissions(
    authEnabled,
    documentPermissionsRequested,
  );
  assertSkipCredentialVerificationAllowed(
    resolveCallerIdentity,
    skipCredentialVerification,
    process.env,
  );
  assertRequireAuthenticatedCallerAllowed(
    requireAuthenticatedCaller,
    resolveCallerIdentity,
    requireAuthenticatedCallerExemptPaths,
  );
  if (authEnabled && skipCredentialVerification) {
    logger.warn(
      "SECURITY: SKIP_CREDENTIAL_VERIFICATION is enabled — Renown credential " +
        "verification is disabled and a bearer token's claimed address is NOT " +
        "cryptographically bound to its signing key. Identity is unverifiable; " +
        "use only in development or test.",
    );
  }

  // Health check endpoint (registered directly on adapter, before auth)
  httpAdapter.getRoute("/health", () => new Response("OK", { status: 200 }));

  const readiness = createReadinessGate();
  httpAdapter.getRoute("/ready", () =>
    readiness.isReady()
      ? new Response("OK", { status: 200 })
      : new Response("starting", { status: 503 }),
  );

  // Explorer route
  const explorerPrefix = getExplorerPrefix(config.basePath);
  httpAdapter.getRoute(`${explorerPrefix}/:endpoint?`, (request) => {
    const url = new URL(request.url);
    // Strip the prefix to find the optional :endpoint segment
    const suffix = url.pathname.slice(explorerPrefix.length).replace(/^\//, "");
    const endpoint = suffix ? `/${suffix}` : "/graphql";
    // Prefer the document-scoped `explorerURLState` payload (produced by the
    // Connect DocumentToolbar) over the plain `?query=` parameter.
    const explorerState = decodeExplorerUrlState(
      url.searchParams.get("explorerURLState") ?? "",
    );
    const query =
      explorerState?.query ?? url.searchParams.get("query") ?? undefined;
    return new Response(
      renderGraphqlPlayground(
        endpoint,
        query,
        explorerState?.headers ?? {},
        explorerState?.variables,
      ),
      {
        headers: { "Content-Type": "text/html" },
      },
    );
  });

  /* Built whenever the bearer is read — which is not the same as the policy
     enforcing anything. `resolveCallerIdentity` defaults to `authEnabled`, so
     this is the same condition it always was unless a deployment opts in. */
  let authFetchMiddleware: AuthFetchMiddleware | undefined;
  let requireAuthFetchMiddleware: RequireAuthFetchMiddleware | undefined;
  let authService: AuthService | undefined;
  if (resolveCallerIdentity || authEnabled) {
    logger.info(
      "Setting up Auth middleware (policy enforcement: @enabled, caller identity: @resolve)",
      authEnabled,
      resolveCallerIdentity,
    );
    const renown =
      options.renown ??
      resolveRenownConfig(configuredRenown, process.env, logger);
    assertCredentialVerifierForSource(
      renown.source,
      options.verifyCredential !== undefined,
    );
    if (options.verifyCredential) {
      logger.info("Renown credentials will be verified by the host's verifier");
    } else {
      logger.info(
        "Renown credentials will be verified against @url",
        renown.switchboardUrl ?? renown.url ?? "the default Renown instance",
      );
    }
    authService = new AuthService({
      enabled: authEnabled,
      resolveIdentity: resolveCallerIdentity,
      admins,
      skipCredentialVerification,
      credentialVerificationCacheTtlMs,
      verifyCredential:
        options.verifyCredential ??
        (await createRenownCredentialVerifier({
          renownUrl: renown.url,
          switchboardUrl: renown.switchboardUrl,
        })),
    });
    authFetchMiddleware = createAuthFetchMiddleware(authService);
    if (requireAuthenticatedCaller) {
      requireAuthFetchMiddleware = createRequireAuthFetchMiddleware(
        requireAuthenticatedCallerExemptPaths,
      );
      // The exempt paths are named in the log, not merely counted: the one
      // question an operator asks about this floor is what is still open, and
      // the answer should be in the boot output rather than in a manifest they
      // have to go and find.
      logger.info(
        requireAuthenticatedCallerExemptPaths.length > 0
          ? `Require-authenticated-caller middleware enabled: anonymous callers are rejected with a 401 before any subgraph, except on ${requireAuthenticatedCallerExemptPaths.join(", ")}`
          : "Require-authenticated-caller middleware enabled: anonymous callers are rejected with a 401 before any subgraph",
      );
    } else {
      // Auth is on in some form, so say plainly what it is not doing. The
      // policy gates the reactor's own document reads; it does not gate a
      // package-provided subgraph, which authorizes nothing on its own. This
      // has always been true over HTTP, and WebSocket admission now matches it
      // rather than refusing tokenless connections on AUTH_ENABLED alone --
      // so a subscription reaches the same surface a query already did.
      logger.warn(
        "Anonymous callers are admitted on every transport, including WebSocket " +
          "subscriptions: REQUIRE_AUTHENTICATED_CALLER is not set. The " +
          "authorization policy gates the reactor's own documents, but a " +
          "package-provided subgraph authorizes nothing on its own. Set " +
          "REQUIRE_AUTHENTICATED_CALLER=true to refuse anonymous callers before " +
          "any subgraph sees them.",
      );
    }
  }

  const dbClosers: Array<() => Promise<void>> = [];

  // Initialize database and analytics store
  const {
    relationalDb,
    analyticsStore,
    closers: analyticsClosers,
  } = await initializeDatabaseAndAnalytics(
    options.dbPath,
    options.pgliteFactory,
  );
  dbClosers.push(...analyticsClosers);

  // Use provided document permission service, or create one if env var is set
  let documentPermissionService = options.documentPermissionService;
  if (!documentPermissionService && DOCUMENT_PERMISSIONS_ENABLED === "true") {
    const { db, knex, pglite } = getDbClient(
      options.dbPath,
      options.pgliteFactory,
    );
    dbClosers.push(...makeDbClosers(knex, pglite));
    // Run document permission migrations
    await runMigrations(db as Kysely<unknown>);
    logger.info("Document permission migrations completed");
    documentPermissionService = new DocumentPermissionService(
      db as Kysely<DocumentPermissionDatabase>,
      { defaultProtection },
    );
    logger.info("Document permission service initialized");
  }

  // The authorization policy collapses the prior dual enforcement paths into
  // one. Document permissions imply authentication (guaranteed by the boot
  // gate above). The service itself is created in _setupAPI, where the
  // reactor client needed for the parent-document resolver exists.
  const policy = documentPermissionService
    ? AuthorizationPolicy.DOCUMENT_PERMISSIONS
    : authEnabled
      ? AuthorizationPolicy.ADMIN_ONLY
      : AuthorizationPolicy.OPEN;
  const authorizationConfig: AuthorizationConfig = {
    admins,
    defaultProtection,
    policy,
  };

  // Initialize attachment service
  const attachmentStoragePath = resolveAttachmentStoragePath(options);
  await mkdir(attachmentStoragePath, { recursive: true });
  const {
    db: attachmentDb,
    knex: attachmentKnex,
    pglite: attachmentPglite,
  } = getDbClient(options.dbPath, options.pgliteFactory);
  dbClosers.push(...makeDbClosers(attachmentKnex, attachmentPglite));
  const ATTACHMENT_SWEEP_INTERVAL_MS = 60 * 60 * 1000; // hourly
  const attachmentBackend = await createStartupAttachmentBackend({
    db: attachmentDb as Kysely<AttachmentDatabase>,
  });
  const attachmentBuilder = new AttachmentBuilder(
    attachmentDb,
    attachmentStoragePath,
  ).withReservationSweepMs(ATTACHMENT_SWEEP_INTERVAL_MS);
  if (attachmentBackend) attachmentBuilder.withBackend(attachmentBackend);
  const attachments: AttachmentBuildResult = await attachmentBuilder.build();
  const attachmentReferenceIndex = await new AttachmentReferenceIndexBuilder(
    attachmentDb,
  ).build();
  dbClosers.push(() => {
    attachments.destroy();
    return Promise.resolve();
  });
  logger.info("Attachment service initialized");

  // Initialize package manager
  const loaders: IPackageLoader[] = options.packageLoaders ?? [
    new ImportPackageLoader(),
  ];

  const packages = new PackageManager(loaders, {
    configFile: options.configFile,
    packages: options.packages ?? [],
  });

  // Package routes hang off <basePath>/api, webhooks off <basePath>/webhooks.
  // Created here rather than in the GraphQL manager because processors are
  // initialised before it exists.
  //
  // Webhook tokens live in the reactor's own database rather than per host, so
  // a URL a provider has registered keeps working across a restart and any
  // replica can serve it.
  const publicUrl = resolvePublicOrigin(port);
  const webhooks = new WebhookService({
    store: new RelationalWebhookStore(relationalDb),
    basePath: config.basePath,
    publicUrl,
  });
  const httpRoutes = new HttpRouteService({
    httpAdapter,
    basePath: config.basePath,
    authService,
    webhooks,
    publicUrl,
    // The reactor sits behind switchboard-lb in every deployed topology, so the
    // forwarded headers naming the public origin come from the balancer, not a caller.
    trustProxy: true,
  });
  // The endpoint family serves from a host scope rather than the adapter, so
  // one dispatch path covers package routes and webhooks alike.
  webhooks.attach(
    httpRoutes.hostScope(
      CORE_PACKAGE_NAME,
      path.posix.join("/", config.basePath ?? "/", WEBHOOK_SEGMENT),
    ),
  );

  return {
    port,
    httpAdapter,
    httpRoutes,
    authFetchMiddleware,
    requireAuthFetchMiddleware,
    authService,
    relationalDb,
    analyticsStore,
    documentPermissionService,
    authorizationConfig,
    attachments,
    attachmentReferenceIndex,
    packages,
    dbClosers,
    readiness,
    attachmentReadsFollowDocumentPolicy,
  };
}

/**
 * Private helper function containing common setup logic for API initialization
 */
async function _setupAPI(
  reactorClient: IReactorClient,
  syncManager: ISyncManager,
  reactorProcessorManager: IReactorProcessorManager,
  httpAdapter: IHttpAdapter,
  authFetchMiddleware: AuthFetchMiddleware | undefined,
  requireAuthFetchMiddleware: RequireAuthFetchMiddleware | undefined,
  authService: AuthService | undefined,
  port: number,
  packages: PackageManager,
  relationalDb: IRelationalDb,
  analyticsStore: IAnalyticsStore,
  documentPermissionService: DocumentPermissionService | undefined,
  processors: Map<string, Processor>,
  subgraphs: Map<string, SubgraphClass[]>,
  options: Options,
  processorApp: ProcessorApp,
  readModels: IReadModel[],
  attachments: AttachmentBuildResult,
  attachmentReferenceIndex: AttachmentReferenceIndexBuildResult,
  attachmentReferenceProjection: AttachmentReferenceProjectionCapability,
  authorizationConfig: AuthorizationConfig,
  documentModelRegistry?: IDocumentModelRegistry,
  dbClosers: Array<() => Promise<void>> = [],
  reactorDriveClient?: IDriveClient,
  syncServingGate?: SyncScopeGate,
  httpRoutes?: HttpRouteService,
  attachmentReadsFollowDocumentPolicy = false,
): Promise<API> {
  const hostModuleBase: IProcessorHostModule = {
    ...createReactorHostModuleBase({
      client: reactorClient,
      readModels,
      relationalDb,
      analyticsStore,
      processorApp,
      config: options.processorConfig,
    }),
    attachments: createAttachmentClient(attachments.service),
  };

  // Per package, so a processor's HTTP scope is bound to its own namespace and
  // cannot be swapped for another package's. Everything else is shared.
  const moduleFor = (packageName: string): IProcessorHostModule => ({
    ...hostModuleBase,
    http: httpRoutes?.scopeForOrNull(packageName),
  });
  const mcpServerEnabled = options.mcp ?? true;

  const logger = options.logger ?? defaultLogger;

  // initialize processors
  const configuredProcessorEntries = Object.entries(
    options.processors ?? {},
  ) as [string, ProcessorInitializer[]][];

  const processorEntries = [
    ...processors.entries(),
    ...configuredProcessorEntries,
  ] as [string, ProcessorInitializer[]][];

  for (const [packageName, fns] of processorEntries) {
    const factories = await Promise.allSettled(
      fns.map(async (fn) => {
        try {
          return fn(moduleFor(packageName));
        } catch (e) {
          logger.error(
            `Error initializing processor factory for package ${packageName}:`,
            e,
          );

          return null;
        }
      }),
    );

    const validFactories = factories.filter(
      (factory): factory is PromiseFulfilledResult<ProcessorFactory> =>
        factory.status === "fulfilled" &&
        factory.value !== null &&
        typeof factory.value === "function",
    );

    if (!validFactories.length) {
      continue;
    }

    // Register with the reactor ProcessorManager
    // Cast the results to ReactorProcessorRecord since the loaded factories
    // implement the reactor interface
    await reactorProcessorManager.registerFactory(
      packageName,
      async (driveHeader) =>
        (
          await Promise.all(
            validFactories.map(async ({ value: driveFactory }) => {
              try {
                const result = await driveFactory(driveHeader);
                return result as unknown as ReactorProcessorRecord[];
              } catch (e) {
                logger.error(
                  `Error creating processor for drive ${driveHeader.id}:`,
                  e,
                );

                return [];
              }
            }),
          )
        ).flat(),
    );
  }

  // Start the server
  const { httpServer, wsServer } = await startServer(
    httpAdapter,
    port,
    options.https,
    logger,
  );

  // Authorization service is always present; created here because the
  // parent-document resolver used for permission inheritance needs the
  // reactor client.
  const authorizationService = createAuthorizationService(
    authorizationConfig,
    documentPermissionService,
    createGetParentIdsFn(reactorClient),
  );
  logger.info(
    `Authorization service initialized (policy: ${authorizationConfig.policy})`,
  );

  // Attachment reads are authorized by the document read, the reactor's read
  // gate, and the projected document/ref relationship; the facade owns that
  // composition so routes never consult any of them directly.
  //
  // The document-read gate is the one sync serving already decides with, rather
  // than a second one built here: two gates over one document model would be
  // two policies that can disagree, and the question both are asking is the
  // same one — may this subject read this document's state.
  //
  // Handed over only when the host asks for it. Which model decides an
  // attachment read is a deployment's choice, the same way the storage backend
  // behind those bytes is, and a host that has not asked keeps the behaviour it
  // has — whatever else it has turned on.
  assertAttachmentPolicyReadsAllowed(
    attachmentReadsFollowDocumentPolicy,
    syncServingGate !== undefined,
  );
  const attachmentAccess: IAttachmentAccessService =
    new AttachmentAccessService(
      createCanonicalDocumentIdResolver(reactorClient),
      authorizationService,
      attachmentReferenceIndex.store,
      attachmentReferenceProjection,
      reactorClient,
      attachmentReadsFollowDocumentPolicy ? syncServingGate : undefined,
    );

  // set up subgraph manager
  const coreSubgraphs: SubgraphClass[] = DefaultCoreSubgraphs.slice();
  coreSubgraphs.push(ReactorSubgraph);

  // Register Auth subgraph when document permission service is available
  if (documentPermissionService) {
    coreSubgraphs.push(AuthSubgraph);
    logger.info("Auth subgraph registered (document permissions enabled)");
  }

  const graphqlManager = await setupGraphQLManager(
    httpAdapter,
    authFetchMiddleware,
    requireAuthFetchMiddleware,
    httpServer,
    wsServer,
    reactorClient,
    relationalDb,
    analyticsStore,
    syncManager,
    {
      extended: subgraphs,
      core: coreSubgraphs,
    },
    logger.child(["graphql-manager"]),
    authorizationService,
    authService,
    documentPermissionService,
    options.enableDocumentModelSubgraphs,
    port,
    reactorDriveClient,
    syncServingGate,
    httpRoutes,
  );

  // Set up event listeners
  setupEventListeners(
    packages,
    graphqlManager,
    reactorProcessorManager,
    moduleFor,
    documentModelRegistry,
  );

  if (mcpServerEnabled) {
    await setupMcpServer(
      {
        client: reactorClient,
        syncManager,
        authorizeRequest: createMcpRequestAuthorizer(
          authService,
          authorizationService,
        ),
      },
      httpAdapter,
    );
    logger.info(`MCP server available at http://localhost:${port}/mcp`);
  }

  const dispose = buildApiDispose({
    graphqlManager,
    httpRoutes,
    httpServer,
    wsServer,
    dbClosers,
    logger,
  });

  return {
    httpAdapter,
    httpRoutes: httpRoutes ?? new HttpRouteService({ httpAdapter }),
    graphqlManager,
    packages,
    attachments,
    attachmentReferenceIndex,
    attachmentAccess,
    authService,
    // Read from the composed middleware rather than from a second pass over
    // the environment, and the same way `#makeWsContextFactory` reads it: the
    // middleware exists exactly when the floor is on, so one value cannot
    // disagree with another about whether this deployment serves anonymous
    // callers.
    requireAuthenticatedCaller: requireAuthFetchMiddleware !== undefined,
    // Handed back rather than kept private: a component the host composes
    // after boot (the workflow runtime) authorizes with this service and
    // stores in this database.
    authorizationService,
    relationalDb,
    dispose,
  };
}

/**
 * Composes the lifecycle teardown for an API instance. Steps run in
 * dependency order so that draining HTTP/GraphQL surfaces happens before the
 * underlying knex pool and PGlite WAL are released. Each step is wrapped in
 * its own try/catch — one failure must not strand the rest of the chain,
 * since this runs on the way to process exit.
 */
function buildApiDispose(args: {
  graphqlManager: GraphQLManager;
  httpRoutes?: HttpRouteService;
  httpServer: http.Server;
  wsServer: WebSocketServer;
  dbClosers: Array<() => Promise<void>>;
  logger: ILogger;
}): () => Promise<void> {
  const {
    graphqlManager,
    httpRoutes,
    httpServer,
    wsServer,
    dbClosers,
    logger,
  } = args;
  let disposed = false;
  return async () => {
    if (disposed) return;
    disposed = true;

    // Before the server closes: every package scope, and the host scopes with
    // them. Nothing downstream depends on the routes still being mounted, and
    // a handler answering during teardown is a handler holding a disposed
    // dependency.
    try {
      httpRoutes?.disposeAll();
    } catch (error) {
      logger.error("API dispose: releasing HTTP routes failed: @error", error);
    }

    try {
      await graphqlManager.shutdown();
    } catch (error) {
      logger.error(
        "API dispose: graphqlManager.shutdown failed: @error",
        error,
      );
    }

    try {
      for (const client of wsServer.clients) client.terminate();
      await new Promise<void>((resolve) => wsServer.close(() => resolve()));
    } catch (error) {
      logger.error("API dispose: wsServer.close failed: @error", error);
    }

    if (httpServer.listening) {
      try {
        // closeAllConnections forces idle keep-alives shut so close() can resolve;
        // otherwise SIGINT-driven shutdown stalls until the OS reaps the sockets.
        httpServer.closeAllConnections();
        await new Promise<void>((resolve, reject) =>
          httpServer.close((err) => (err ? reject(err) : resolve())),
        );
      } catch (error) {
        logger.error("API dispose: httpServer.close failed: @error", error);
      }
    }

    for (const close of dbClosers) {
      try {
        await close();
      } catch (error) {
        logger.error("API dispose: db closer failed: @error", error);
      }
    }
  };
}

/**
 * Initializes and starts the API server using an initializer function.
 * This function first loads packages to get document models, then calls the initializer function
 * to create the reactor client module with the appropriate dependencies.
 *
 * @param clientInitializer - Initializer function that creates the reactor client module with document models.
 * @param options - Additional options for server configuration.
 *
 * @returns The API server components along with the created client instances.
 */
/**
 * Result of a client initializer. `reactorDriveClient` is optionally returned
 * alongside the reactor module so resolvers can dispatch reactor-drive parent
 * ops to it; legacy switchboards omit it.
 */
export interface ClientInitializerResult {
  module: InProcessReactorClientModule;
  reactorDriveClient?: IDriveClient;
  attachmentReferenceProjection?: AttachmentReferenceProjectionCapability;
}

export interface ClientInitializerDependencies {
  attachmentReferenceWriter: IAttachmentReferenceWriter;
  /** Upgrade manifests exported by the loaded packages, one per type. */
  upgradeManifests: UpgradeManifest<readonly number[]>[];
}

export type { AttachmentReferenceProjectionCapability } from "./services/attachment-access.service.js";

export async function initializeAndStartAPI(
  clientInitializer: (
    documentModels: DocumentModelModule[],
    dependencies: ClientInitializerDependencies,
  ) => Promise<ClientInitializerResult>,
  options: Options,
  processorApp: ProcessorApp,
): Promise<
  API & {
    client: IReactorClient;
    syncManager: ISyncManager;
    documentModelRegistry: IDocumentModelRegistry;
    readiness: ReadinessGate;
    attachmentReferenceProjection: AttachmentReferenceProjectionCapability;
    packageManager: PackageManager;
  }
> {
  const {
    port,
    httpAdapter,
    httpRoutes,
    authFetchMiddleware,
    requireAuthFetchMiddleware,
    authService,
    relationalDb,
    analyticsStore,
    documentPermissionService,
    authorizationConfig,
    attachments,
    attachmentReferenceIndex,
    packages,
    dbClosers,
    readiness,
    attachmentReadsFollowDocumentPolicy,
  } = await _setupCommonInfrastructure(options);

  const { documentModels, upgradeManifests, processors, subgraphs } =
    await packages.init();

  const {
    module: reactorClientModule,
    reactorDriveClient,
    attachmentReferenceProjection = {
      status: "unavailable",
      reason: "initializer-did-not-report",
    },
  } = await clientInitializer(documentModels, {
    attachmentReferenceWriter: attachmentReferenceIndex.store,
    upgradeManifests,
  });

  // Extract client and syncManager from the module
  const reactorClient = reactorClientModule.client;

  const syncManager =
    reactorClientModule.reactorModule?.syncModule?.syncManager;
  if (!syncManager) {
    throw new Error(
      "SyncManager not available from InProcessReactorClientModule",
    );
  }

  const reactorProcessorManager =
    reactorClientModule.reactorModule?.processorManager;
  if (!reactorProcessorManager) {
    throw new Error(
      "ProcessorManager not available from InProcessReactorClientModule",
    );
  }

  const documentModelRegistry =
    reactorClientModule.reactorModule?.documentModelRegistry;
  if (!documentModelRegistry) {
    throw new Error(
      "DocumentModelRegistry not available from InProcessReactorClientModule",
    );
  }

  const readModelCoordinator =
    reactorClientModule.reactorModule?.readModelCoordinator;
  const readModels = readModelCoordinator?.readModels ?? [];

  const api = await _setupAPI(
    reactorClient,
    syncManager,
    reactorProcessorManager,
    httpAdapter,
    authFetchMiddleware,
    requireAuthFetchMiddleware,
    authService,
    port,
    packages,
    relationalDb,
    analyticsStore,
    documentPermissionService,
    processors,
    subgraphs,
    options,
    processorApp,
    readModels,
    attachments,
    attachmentReferenceIndex,
    attachmentReferenceProjection,
    authorizationConfig,
    documentModelRegistry,
    dbClosers,
    reactorDriveClient,
    buildSyncServingGate(
      reactorClientModule.reactorModule,
      authorizationConfig,
      options.logger ?? defaultLogger,
    ),
    httpRoutes,
    attachmentReadsFollowDocumentPolicy,
  );

  return {
    ...api,
    client: reactorClient,
    syncManager,
    documentModelRegistry,
    readiness,
    attachmentReferenceProjection,
    packageManager: packages,
  };
}

/**
 * The origin to advertise in a webhook URL.
 *
 * A provider is a third party: it has to be given something it can resolve, so
 * a relative path is not an option. The platform variables come first, then a
 * bare deploy domain, and finally the local origin — which is right for `ph
 * dev` behind a tunnel and, at worst, obviously wrong rather than silently
 * unusable.
 */
function resolvePublicOrigin(port: number): string {
  const explicit = process.env.PUBLIC_URL ?? process.env.RENDER_EXTERNAL_URL;
  if (explicit) return withScheme(explicit);
  const domain = process.env.HEROKU_APP_DEFAULT_DOMAIN_NAME;
  if (domain) return withScheme(domain);
  return `http://localhost:${port}`;
}

function withScheme(origin: string): string {
  const trimmed = origin.replace(/\/+$/, "");
  return /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
}
