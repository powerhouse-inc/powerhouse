import type { PGlite } from "@electric-sql/pglite";
import type { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import { PostgresAnalyticsStore } from "@powerhousedao/analytics-engine-pg";
import { getConfig } from "@powerhousedao/config/node";
import type {
  IDocumentModelRegistry,
  IDriveClient,
  IReadModel,
  IReactorClient,
  IProcessorManager as IReactorProcessorManager,
  ISyncManager,
  ReactorClientModule,
  ProcessorRecord as ReactorProcessorRecord,
} from "@powerhousedao/reactor";
import { AttachmentBuilder } from "@powerhousedao/reactor-attachments";
import type { AttachmentBuildResult } from "@powerhousedao/reactor-attachments";
import { createAttachmentClient } from "@powerhousedao/reactor-attachments/client";
import { setupMcpServer } from "@powerhousedao/reactor-mcp";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import type { Kysely } from "kysely";
import { mkdir } from "node:fs/promises";
import type http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Pool } from "pg";
import { WebSocketServer } from "ws";
import {
  createRelationalDb,
  type IProcessorHostModule,
  type IRelationalDb,
  type ProcessorApp,
} from "@powerhousedao/shared/processors";
import { childLogger, type ILogger } from "document-model";
import { config, DefaultCoreSubgraphs } from "./config.js";
import { AuthSubgraph } from "./graphql/auth/subgraph.js";
import {
  createAuthFetchMiddleware,
  type AuthFetchMiddleware,
} from "./graphql/gateway/auth-middleware.js";
import {
  createGatewayAdapter,
  createHttpAdapter,
} from "./graphql/gateway/factory.js";
import type { IHttpAdapter, TlsOptions } from "./graphql/gateway/types.js";
import { GraphQLManager } from "./graphql/graphql-manager.js";
import { renderGraphqlPlayground } from "./graphql/playground.js";
import { ReactorSubgraph } from "./graphql/reactor/subgraph.js";
import type { SubgraphClass } from "./graphql/types.js";
import { runMigrations } from "./migrations/index.js";
import { ImportPackageLoader } from "./packages/import-loader.js";
import { PackageManager } from "./packages/package-manager.js";
import { AuthService } from "./services/auth.service.js";
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
import type {
  API,
  IPackageLoader,
  IReactorProcessorHostModule,
  Processor,
  ProcessorDriveFactory,
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
  };
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

function createReadinessGate(): ReadinessGate {
  let ready = false;
  return {
    isReady: () => ready,
    markReady: () => {
      ready = true;
    },
  };
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
 * Sets up the subgraph manager and registers subgraphs
 */
async function setupGraphQLManager(
  httpAdapter: IHttpAdapter,
  authFetchMiddleware: AuthFetchMiddleware | undefined,
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
    await createGatewayAdapter("apollo", logger),
    authService,
    documentPermissionService,
    {
      enableDocumentModelSubgraphs,
    },
    port,
    authorizationService,
    reactorDriveClient,
  );

  await graphqlManager.init(subgraphs.core, authFetchMiddleware);

  for (const [, collection] of subgraphs.extended.entries()) {
    for (const subgraph of collection) {
      await graphqlManager.registerSubgraph(subgraph, "graphql");
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
  module: IProcessorHostModule,
  documentModelRegistry?: IDocumentModelRegistry,
): void {
  pkgManager.onDocumentModelsChange((packagedModels) => {
    if (documentModelRegistry) {
      const newModules = Object.values(packagedModels).flat();
      const registeredModules = documentModelRegistry.getAllModules();
      const registeredTypes = new Set(
        registeredModules.map((m) => m.documentModel.global.id),
      );

      const modulesToRegister = newModules.filter(
        (mod) => !registeredTypes.has(mod.documentModel.global.id),
      );
      if (modulesToRegister.length > 0) {
        const results = documentModelRegistry.registerModules(
          ...modulesToRegister,
        );
        for (const result of results) {
          if (result.status === "success") {
            defaultLogger.info(
              `Registered new document model: ${result.item.documentModel.global.id}`,
            );
          } else {
            defaultLogger.error(
              `Failed to register document model: ${result.error.message}`,
            );
          }
        }
      }
    }
    void graphqlManager.regenerateDocumentModelSubgraphs();
  });

  pkgManager.onSubgraphsChange((packagedSubgraphs) => {
    void (async () => {
      for (const [, subgraphs] of packagedSubgraphs) {
        for (const subgraph of subgraphs) {
          await graphqlManager.registerSubgraph(subgraph, "graphql");
        }
      }
      await graphqlManager.updateRouter();
    })();
  });

  pkgManager.onProcessorsChange((processors) => {
    void (async () => {
      for (const [packageName, fns] of processors) {
        await reactorProcessorManager.unregisterFactory(packageName);

        const factories = fns.map((fn) => fn(module));

        const validBuilders = factories.filter(
          (factory): factory is ProcessorDriveFactory =>
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
  authService: AuthService | undefined;
  relationalDb: IRelationalDb;
  analyticsStore: IAnalyticsStore;
  documentPermissionService: DocumentPermissionService | undefined;
  authorizationConfig: AuthorizationConfig;
  attachments: AttachmentBuildResult;
  packages: PackageManager;
  dbClosers: Array<() => Promise<void>>;
  readiness: ReadinessGate;
}> {
  const port = options.port ?? DEFAULT_PORT;
  const { adapter: httpAdapter } = await createHttpAdapter("express");
  const logger = options.logger ?? defaultLogger;

  // Setup auth configuration
  let admins: string[] = [];
  let authEnabled = false;
  if (options.configFile) {
    const config = getConfig(options.configFile);
    admins = config.auth?.admins.map((a) => a.toLowerCase()) ?? [];
    authEnabled = config.auth?.enabled ?? false;
  } else if (options.auth) {
    admins = options.auth.admins.map((a) => a.toLowerCase());
    authEnabled = options.auth.enabled;
  }
  const {
    AUTH_ENABLED,
    ADMINS,
    DEFAULT_PROTECTION,
    DOCUMENT_PERMISSIONS_ENABLED,
    SKIP_CREDENTIAL_VERIFICATION,
    CREDENTIAL_VERIFICATION_CACHE_TTL_MS,
  } = process.env;
  if (AUTH_ENABLED !== undefined) {
    authEnabled = AUTH_ENABLED === "true";
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

  // Health check endpoint (registered directly on adapter, before auth)
  httpAdapter.getRoute("/health", () => new Response("OK", { status: 200 }));

  const readiness = createReadinessGate();
  httpAdapter.getRoute("/ready", () =>
    readiness.isReady()
      ? new Response("OK", { status: 200 })
      : new Response("starting", { status: 503 }),
  );

  // Explorer route
  const explorerPrefix = `${config.basePath}/explorer`;
  httpAdapter.getRoute(`${explorerPrefix}/:endpoint?`, (request) => {
    const url = new URL(request.url);
    // Strip the prefix to find the optional :endpoint segment
    const suffix = url.pathname.slice(explorerPrefix.length).replace(/^\//, "");
    const endpoint = suffix ? `/${suffix}` : "/graphql";
    const query = url.searchParams.get("query") ?? undefined;
    return new Response(renderGraphqlPlayground(endpoint, query), {
      headers: { "Content-Type": "text/html" },
    });
  });

  // Create auth fetch middleware if auth is enabled
  let authFetchMiddleware: AuthFetchMiddleware | undefined;
  let authService: AuthService | undefined;
  if (authEnabled) {
    logger.info("Setting up Auth middleware");
    authService = new AuthService({
      enabled: authEnabled,
      admins,
      skipCredentialVerification,
      credentialVerificationCacheTtlMs,
    });
    authFetchMiddleware = createAuthFetchMiddleware(authService);
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
  const attachments = await new AttachmentBuilder(
    attachmentDb,
    attachmentStoragePath,
  )
    .withReservationSweepMs(ATTACHMENT_SWEEP_INTERVAL_MS)
    .build();
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

  return {
    port,
    httpAdapter,
    authFetchMiddleware,
    authService,
    relationalDb,
    analyticsStore,
    documentPermissionService,
    authorizationConfig,
    attachments,
    packages,
    dbClosers,
    readiness,
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
  authorizationConfig: AuthorizationConfig,
  documentModelRegistry?: IDocumentModelRegistry,
  dbClosers: Array<() => Promise<void>> = [],
  reactorDriveClient?: IDriveClient,
): Promise<API> {
  const hostModule: IReactorProcessorHostModule = {
    relationalDb,
    analyticsStore,
    processorApp,
    config: options.processorConfig,
    client: reactorClient,
    attachments: createAttachmentClient(attachments.service),
    dispatch: {
      async execute(docId, branch, actions, signal) {
        const jobInfo = await reactorClient.executeAsync(
          docId,
          branch,
          actions,
          signal,
        );
        return { id: jobInfo.id, status: jobInfo.status };
      },
    },
    getReadModel<T>(name: string): T {
      const model = readModels.find((m) => m.name === name);
      if (!model) {
        throw new Error(`Read model "${name}" not found`);
      }
      return model as unknown as T;
    },
  };
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
          return fn(hostModule);
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
      (factory): factory is PromiseFulfilledResult<ProcessorDriveFactory> =>
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
  );

  // Set up event listeners
  setupEventListeners(
    packages,
    graphqlManager,
    reactorProcessorManager,
    hostModule,
    documentModelRegistry,
  );

  if (mcpServerEnabled) {
    await setupMcpServer({ client: reactorClient, syncManager }, httpAdapter);
    logger.info(`MCP server available at http://localhost:${port}/mcp`);
  }

  const dispose = buildApiDispose({
    graphqlManager,
    httpServer,
    wsServer,
    dbClosers,
    logger,
  });

  return {
    httpAdapter,
    graphqlManager,
    packages,
    attachments,
    authService,
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
  httpServer: http.Server;
  wsServer: WebSocketServer;
  dbClosers: Array<() => Promise<void>>;
  logger: ILogger;
}): () => Promise<void> {
  const { graphqlManager, httpServer, wsServer, dbClosers, logger } = args;
  let disposed = false;
  return async () => {
    if (disposed) return;
    disposed = true;

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
  module: ReactorClientModule;
  reactorDriveClient?: IDriveClient;
}

export async function initializeAndStartAPI(
  clientInitializer: (
    documentModels: DocumentModelModule[],
  ) => Promise<ClientInitializerResult>,
  options: Options,
  processorApp: ProcessorApp,
): Promise<
  API & {
    client: IReactorClient;
    syncManager: ISyncManager;
    documentModelRegistry: IDocumentModelRegistry;
    readiness: ReadinessGate;
  }
> {
  const {
    port,
    httpAdapter,
    authFetchMiddleware,
    authService,
    relationalDb,
    analyticsStore,
    documentPermissionService,
    authorizationConfig,
    attachments,
    packages,
    dbClosers,
    readiness,
  } = await _setupCommonInfrastructure(options);

  const { documentModels, processors, subgraphs } = await packages.init();

  const { module: reactorClientModule, reactorDriveClient } =
    await clientInitializer(documentModels);

  // Extract client and syncManager from the module
  const reactorClient = reactorClientModule.client;

  const syncManager =
    reactorClientModule.reactorModule?.syncModule?.syncManager;
  if (!syncManager) {
    throw new Error("SyncManager not available from ReactorClientModule");
  }

  const reactorProcessorManager =
    reactorClientModule.reactorModule?.processorManager;
  if (!reactorProcessorManager) {
    throw new Error("ProcessorManager not available from ReactorClientModule");
  }

  const documentModelRegistry =
    reactorClientModule.reactorModule?.documentModelRegistry;
  if (!documentModelRegistry) {
    throw new Error(
      "DocumentModelRegistry not available from ReactorClientModule",
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
    authorizationConfig,
    documentModelRegistry,
    dbClosers,
    reactorDriveClient,
  );

  return {
    ...api,
    client: reactorClient,
    syncManager,
    documentModelRegistry,
    readiness,
  };
}
