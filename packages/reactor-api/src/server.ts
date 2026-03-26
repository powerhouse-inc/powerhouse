import type { PGlite } from "@electric-sql/pglite";
import type { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import { PostgresAnalyticsStore } from "@powerhousedao/analytics-engine-pg";
import { getConfig } from "@powerhousedao/config/node";
import type {
  IDocumentModelRegistry,
  IReactorClient,
  IProcessorManager as IReactorProcessorManager,
  ISyncManager,
  ReactorClientModule,
  ProcessorRecord as ReactorProcessorRecord,
} from "@powerhousedao/reactor";
import { setupMcpServer } from "@powerhousedao/reactor-mcp";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import type { Express } from "express";
import type { Kysely } from "kysely";
import type http from "node:http";
import path from "node:path";
import type { Pool } from "pg";
import { WebSocketServer } from "ws";
// Import tracing - initializes OpenTelemetry and provides stub functions for backwards compatibility
import {
  createRelationalDb,
  type IProcessorHostModule,
  type IRelationalDb,
  type ProcessorApp,
} from "@powerhousedao/shared/processors";
import { childLogger, type ILogger } from "document-model";
import { config, DefaultCoreSubgraphs } from "./config.js";
import { AuthSubgraph } from "./graphql/auth/subgraph.js";
import { GraphQLManager } from "./graphql/graphql-manager.js";
import {
  createAuthFetchMiddleware,
  type AuthFetchMiddleware,
} from "./graphql/gateway/auth-middleware.js";
import {
  createGatewayAdapter,
  createHttpAdapter,
} from "./graphql/gateway/factory.js";
import type { IHttpAdapter, TlsOptions } from "./graphql/gateway/types.js";
import { renderGraphqlPlayground } from "./graphql/playground.js";
import { ReactorSubgraph } from "./graphql/reactor/subgraph.js";
import type { SubgraphClass } from "./graphql/types.js";
import { runMigrations } from "./migrations/index.js";
import { ImportPackageLoader } from "./packages/import-loader.js";
import { PackageManager } from "./packages/package-manager.js";
import { AuthService } from "./services/auth.service.js";
import { AuthorizationService } from "./services/authorization.service.js";
import { DocumentPermissionService } from "./services/document-permission.service.js";
import { initTracing, isTracingEnabled, trace } from "./tracing.js";
import type {
  API,
  IPackageLoader,
  Processor,
  ProcessorDriveFactory,
  ProcessorFactoryBuilder,
} from "./types.js";
import {
  getDbClient,
  initAnalyticsStoreSql,
  type DocumentPermissionDatabase,
} from "./utils/db.js";

const defaultLogger = childLogger(["reactor-api", "server"]);

type Options = {
  express?: Express;
  port?: number;
  dbPath: string | undefined;
  client?: PGlite | typeof Pool | undefined;
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
  packageLoader?: IPackageLoader;
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
};

type ProcessorInitializer = ProcessorFactoryBuilder;

const DEFAULT_PORT = 4000;

/**
 * Initializes the database and analytics store
 */
async function initializeDatabaseAndAnalytics(
  dbPath: string | undefined,
): Promise<{
  relationalDb: IRelationalDb;
  analyticsStore: IAnalyticsStore;
}> {
  const { db, knex } = getDbClient(dbPath);
  const relationalDb = createRelationalDb<unknown>(db);
  const analyticsStore = new PostgresAnalyticsStore({
    knex,
  });

  for (const sql of initAnalyticsStoreSql) {
    await knex.raw(sql);
  }

  return { relationalDb, analyticsStore };
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
  auth?: {
    enabled: boolean;
    admins: string[];
  },
  documentPermissionService?: DocumentPermissionService,
  enableDocumentModelSubgraphs?: boolean,
  port?: number,
  authorizationService?: AuthorizationService,
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
    createGatewayAdapter("apollo", logger),
    {
      enabled: auth?.enabled ?? false,
      admins: auth?.admins ?? [],
    },
    documentPermissionService,
    {
      enableDocumentModelSubgraphs,
    },
    port,
    authorizationService,
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

      for (const mod of newModules) {
        const docType = mod.documentModel.global.id;
        if (!registeredTypes.has(docType)) {
          defaultLogger.info(`Registering new document model: ${docType}`);
          documentModelRegistry.registerModules(mod);
        }
      }
    }
    void graphqlManager.regenerateDocumentModelSubgraphs();
  });

  pkgManager.onSubgraphsChange(async (packagedSubgraphs) => {
    for (const [, subgraphs] of packagedSubgraphs) {
      for (const subgraph of subgraphs) {
        await graphqlManager.registerSubgraph(subgraph, "graphql");
      }
    }
    await graphqlManager.updateRouter();
  });

  pkgManager.onProcessorsChange(async (processors) => {
    for (const [packageName, fns] of processors) {
      await reactorProcessorManager.unregisterFactory(packageName);

      const factories = fns.map((fn) => fn(module));

      const validBuilders = factories.filter(
        (factory): factory is ProcessorDriveFactory =>
          factory !== null && typeof factory === "function",
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
  auth: {
    enabled: boolean;
    admins: string[];
  };
  relationalDb: IRelationalDb;
  analyticsStore: IAnalyticsStore;
  documentPermissionService: DocumentPermissionService | undefined;
  authorizationService: AuthorizationService | undefined;
  packages: PackageManager;
}> {
  // Initialize OpenTelemetry tracing
  if (isTracingEnabled()) {
    await initTracing();
  }

  const port = options.port ?? DEFAULT_PORT;
  const { adapter: httpAdapter } = createHttpAdapter(
    "express",
    options.express,
  );

  // Setup auth configuration
  let admins: string[] = [];
  let authEnabled = false;
  if (options.configFile) {
    const config = getConfig(options.configFile);
    admins = config.auth?.admins?.map((a) => a.toLowerCase()) ?? [];
    authEnabled = config.auth?.enabled ?? false;
  } else if (options.auth) {
    admins = options.auth?.admins?.map((a) => a.toLowerCase()) ?? [];
    authEnabled = options.auth?.enabled ?? false;
  }
  const {
    AUTH_ENABLED,
    ADMINS,
    DEFAULT_PROTECTION,
    DOCUMENT_PERMISSIONS_ENABLED,
    SKIP_CREDENTIAL_VERIFICATION,
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

  // Warn about deprecated env vars
  const { USERS, GUESTS, FREE_ENTRY } = process.env;
  if (USERS || GUESTS || FREE_ENTRY) {
    console.warn(
      "[DEPRECATION WARNING] The USERS, GUESTS, and FREE_ENTRY environment variables are no longer supported. " +
        "Access control is now managed per-document via the DocumentProtection system. " +
        "Use DEFAULT_PROTECTION=true for strict mode, or manage protection per document via the GraphQL API. " +
        "See the auth documentation for migration guidance.",
    );
  }

  let skipCredentialVerification = false;
  if (SKIP_CREDENTIAL_VERIFICATION !== undefined) {
    skipCredentialVerification = SKIP_CREDENTIAL_VERIFICATION === "true";
  }

  const logger = options.logger ?? defaultLogger;

  // Health check endpoint (registered directly on adapter, before auth)
  httpAdapter.getRoute("/health", () => new Response("OK", { status: 200 }));

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
  if (authEnabled) {
    logger.info("Setting up Auth middleware");
    const authService = new AuthService({
      enabled: authEnabled,
      admins,
      skipCredentialVerification,
    });
    authFetchMiddleware = createAuthFetchMiddleware(authService);
  }

  // Initialize database and analytics store
  const { relationalDb, analyticsStore } = await trace(
    "reactor-api.init.database",
    { tags: { "resource.name": "database" } },
    () => initializeDatabaseAndAnalytics(options.dbPath),
  );

  // Use provided document permission service, or create one if env var is set
  let documentPermissionService = options.documentPermissionService;
  if (!documentPermissionService && DOCUMENT_PERMISSIONS_ENABLED === "true") {
    const { db } = getDbClient(options.dbPath);
    // Run document permission migrations
    await runMigrations(db as Kysely<unknown>);
    logger.info("Document permission migrations completed");
    documentPermissionService = new DocumentPermissionService(
      db as Kysely<DocumentPermissionDatabase>,
      { defaultProtection },
    );
    logger.info("Document permission service initialized");
  }

  // Create AuthorizationService when document permission service is available
  let authorizationService: AuthorizationService | undefined;
  if (documentPermissionService) {
    authorizationService = new AuthorizationService(documentPermissionService, {
      admins,
      defaultProtection,
    });
    logger.info("Authorization service initialized");
  }

  // Initialize package manager
  const packageLoader = options.packageLoader ?? new ImportPackageLoader();
  const loaders: IPackageLoader[] = [packageLoader];

  const packages = new PackageManager(loaders, {
    configFile: options.configFile,
    packages: options.packages ?? [],
  });

  return {
    port,
    httpAdapter,
    authFetchMiddleware,
    auth: {
      enabled: authEnabled,
      admins,
    },
    relationalDb,
    analyticsStore,
    documentPermissionService,
    authorizationService,
    packages,
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
  port: number,
  packages: PackageManager,
  relationalDb: IRelationalDb,
  analyticsStore: IAnalyticsStore,
  documentPermissionService: DocumentPermissionService | undefined,
  processors: Map<string, Processor>,
  subgraphs: Map<string, SubgraphClass[]>,
  options: Options,
  auth: {
    enabled: boolean;
    admins: string[];
  },
  processorApp: ProcessorApp,
  authorizationService?: AuthorizationService,
  documentModelRegistry?: IDocumentModelRegistry,
): Promise<API> {
  const module = {
    relationalDb,
    analyticsStore,
    processorApp,
    config: options.processorConfig,
  } as IProcessorHostModule;
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
    const factories = fns.map((fn) => {
      try {
        return fn(module);
      } catch (e) {
        logger.error(
          `Error initializing processor factory for package ${packageName}:`,
          e,
        );

        return null;
      }
    });

    const validFactories = factories.filter(
      (factory): factory is ProcessorDriveFactory =>
        factory !== null && typeof factory === "function",
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
            validFactories.map(async (driveFactory) => {
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
    auth,
    documentPermissionService,
    options.enableDocumentModelSubgraphs,
    port,
    authorizationService,
  );

  // Set up event listeners
  setupEventListeners(
    packages,
    graphqlManager,
    reactorProcessorManager,
    module,
    documentModelRegistry,
  );

  if (mcpServerEnabled) {
    // TODO: decouple reactor-mcp from Express
    await setupMcpServer(
      { client: reactorClient, syncManager },
      httpAdapter.handle as Express,
    );
    logger.info(`MCP server available at http://localhost:${port}/mcp`);
  }

  return {
    app: httpAdapter,
    graphqlManager,
    packages,
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
export async function initializeAndStartAPI(
  clientInitializer: (
    documentModels: DocumentModelModule[],
  ) => Promise<ReactorClientModule>,
  options: Options,
  processorApp: ProcessorApp,
): Promise<
  API & {
    client: IReactorClient;
    syncManager: ISyncManager;
    documentModelRegistry: IDocumentModelRegistry;
  }
> {
  const {
    port,
    httpAdapter,
    authFetchMiddleware,
    auth,
    relationalDb,
    analyticsStore,
    documentPermissionService,
    authorizationService,
    packages,
  } = await trace(
    "reactor-api.setup.infrastructure",
    { tags: { "resource.name": "infrastructure" } },
    () => _setupCommonInfrastructure(options),
  );

  const { documentModels, processors, subgraphs } = await trace(
    "reactor-api.packages.init",
    { tags: { "resource.name": "packages" } },
    () => packages.init(),
  );

  const reactorClientModule = await trace(
    "reactor-api.reactor-client.init",
    { tags: { "resource.name": "reactor-client" } },
    () => clientInitializer(documentModels),
  );

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

  const api = await _setupAPI(
    reactorClient,
    syncManager,
    reactorProcessorManager,
    httpAdapter,
    authFetchMiddleware,
    port,
    packages,
    relationalDb,
    analyticsStore,
    documentPermissionService,
    processors,
    subgraphs,
    options,
    auth,
    processorApp,
    authorizationService,
    documentModelRegistry,
  );

  return {
    ...api,
    client: reactorClient,
    syncManager,
    documentModelRegistry,
  };
}
