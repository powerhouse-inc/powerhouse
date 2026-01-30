import type { PGlite } from "@electric-sql/pglite";
import type { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import { PostgresAnalyticsStore } from "@powerhousedao/analytics-engine-pg";
import { getConfig } from "@powerhousedao/config/node";
import type {
  IDocumentModelRegistry,
  IReactorClient,
  ISyncManager,
} from "@powerhousedao/reactor";
import { setupMcpServer } from "@powerhousedao/reactor-mcp";
import devcert from "devcert";
import type {
  DocumentDriveDocument,
  IDocumentDriveServer,
  IProcessorHostModule,
  IProcessorManager,
  IRelationalDb,
  ProcessorFactory,
} from "document-drive";
import {
  childLogger,
  createRelationalDb,
  ProcessorManager,
} from "document-drive";
import type { DocumentModelModule } from "document-model";
import type { Express } from "express";
import express from "express";
import type { Kysely } from "kysely";
import fs from "node:fs";
import type http from "node:http";
import https from "node:https";
import path from "node:path";
import type { TlsOptions } from "node:tls";
import type { Pool } from "pg";
import { WebSocketServer } from "ws";
// Import tracing - initializes OpenTelemetry and provides stub functions for backwards compatibility
import { initTracing, isTracingEnabled, trace } from "./tracing.js";
import { config, DefaultCoreSubgraphs } from "./config.js";
import { AuthSubgraph } from "./graphql/auth/subgraph.js";
import { GraphQLManager } from "./graphql/graphql-manager.js";
import { renderGraphqlPlayground } from "./graphql/playground.js";
import { ReactorSubgraph } from "./graphql/reactor/subgraph.js";
import type { SubgraphClass } from "./graphql/types.js";
import { runMigrations } from "./migrations/index.js";
import { ImportPackageLoader } from "./packages/import-loader.js";
import {
  getUniqueDocumentModels,
  PackageManager,
} from "./packages/package-manager.js";
import type { AuthenticatedRequest } from "./services/auth.service.js";
import { AuthService } from "./services/auth.service.js";
import { DocumentPermissionService } from "./services/document-permission.service.js";
import type { API, IPackageLoader, Processor } from "./types.js";
import {
  getDbClient,
  initAnalyticsStoreSql,
  type DocumentPermissionDatabase,
} from "./utils/db.js";

const logger = childLogger(["reactor-api", "server"]);

type Options = {
  express?: Express;
  port?: number;
  dbPath: string | undefined;
  client?: PGlite | typeof Pool | undefined;
  configFile?: string;
  packages?: string[];
  auth?: {
    enabled: boolean;
    guests: string[];
    users: string[];
    admins: string[];
    freeEntry: boolean;
  };
  https?:
    | {
        keyPath: string;
        certPath: string;
      }
    | boolean
    | undefined;
  packageLoader?: IPackageLoader;
  processors?: Record<string, Processor>;
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
};

const DEFAULT_PORT = 4000;
/**
 * Sets up the Express app with necessary routes
 */
function setupGraphQlExplorer(router: express.Router): void {
  router.get("/explorer/:endpoint?", (req, res) => {
    res.setHeader("Content-Type", "text/html");
    const endpoint =
      req.params.endpoint !== undefined
        ? `/${req.params.endpoint}`
        : "/graphql";

    const { query } = req.query;
    if (query && typeof query !== "string") {
      throw new Error("Invalid query");
    }

    res.send(renderGraphqlPlayground(endpoint, query));
  });
}

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
  app: Express,
  httpServer: http.Server,
  wsServer: WebSocketServer,
  reactor: IDocumentDriveServer,
  client: IReactorClient,
  relationalDb: IRelationalDb,
  analyticsStore: IAnalyticsStore,
  syncManager: ISyncManager,
  subgraphs: {
    extended: Map<string, SubgraphClass[]>;
    core: SubgraphClass[];
  },
  auth?: {
    enabled: boolean;
    guests: string[];
    users: string[];
    admins: string[];
    freeEntry: boolean;
  },
  documentPermissionService?: DocumentPermissionService,
  enableDocumentModelSubgraphs?: boolean,
): Promise<GraphQLManager> {
  const graphqlManager = new GraphQLManager(
    config.basePath,
    app,
    httpServer,
    wsServer,
    reactor,
    client,
    relationalDb,
    analyticsStore,
    syncManager,
    {
      enabled: auth?.enabled ?? false,
      guests: auth?.guests ?? [],
      users: auth?.users ?? [],
      admins: auth?.admins ?? [],
      freeEntry: auth?.freeEntry ?? false,
    },
    documentPermissionService,
    {
      enableDocumentModelSubgraphs,
    },
  );

  await graphqlManager.init(subgraphs.core);

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
  reactor: IDocumentDriveServer,
  graphqlManager: GraphQLManager,
  processorManager: IProcessorManager,
  module: {
    relationalDb: IRelationalDb;
    analyticsStore: IAnalyticsStore;
  },
): void {
  pkgManager.onDocumentModelsChange(async (documentModels) => {
    reactor.setDocumentModelModules(Object.values(documentModels).flat());
    await graphqlManager.updateRouter();
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
      await processorManager.unregisterFactory(packageName);

      const factories = fns.map((fn) =>
        fn({
          analyticsStore: module.analyticsStore,
          relationalDb: module.relationalDb,
        }),
      );

      await processorManager.registerFactory(packageName, async (driveHeader) =>
        (
          await Promise.all(
            factories.map((factory) => Promise.resolve(factory(driveHeader))),
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
  app: Express,
  port: number,
  httpsOptions: Options["https"],
): Promise<{ httpServer: http.Server; wsServer: WebSocketServer }> {
  let httpServer: http.Server;

  if (httpsOptions) {
    const currentDir = process.cwd();

    if (typeof httpsOptions === "object") {
      httpServer = https.createServer(
        {
          key: fs.readFileSync(path.join(currentDir, httpsOptions.keyPath)),
          cert: fs.readFileSync(path.join(currentDir, httpsOptions.certPath)),
        },
        app,
      );
    } else {
      try {
        const { cert, key } = (await devcert.certificateFor(
          "localhost",
        )) as TlsOptions;
        if (!cert || !key) {
          throw new Error("Invalid certificate generated");
        }
        httpServer = https.createServer({ cert, key }, app);
      } catch (err) {
        console.error("Failed to get HTTPS certificate:", err);
        throw new Error("Failed to start HTTPS server");
      }
    }
    httpServer.listen(port);
  } else {
    httpServer = app.listen(port);
  }

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
  app: Express;
  auth: {
    enabled: boolean;
    guests: string[];
    users: string[];
    admins: string[];
    freeEntry: boolean;
  };
  relationalDb: IRelationalDb;
  analyticsStore: IAnalyticsStore;
  documentPermissionService: DocumentPermissionService | undefined;
  packages: PackageManager;
}> {
  // Initialize OpenTelemetry tracing
  if (isTracingEnabled()) {
    await initTracing();
  }

  const port = options.port ?? DEFAULT_PORT;
  const app = options.express ?? express();

  // Setup auth configuration
  let admins: string[] = [];
  let users: string[] = [];
  let guests: string[] = [];
  let authEnabled = false;
  let freeEntry = false;
  if (options.configFile) {
    const config = getConfig(options.configFile);
    admins = config.auth?.admins?.map((a) => a.toLowerCase()) ?? [];
    users = config.auth?.users?.map((u) => u.toLowerCase()) ?? [];
    guests = config.auth?.guests?.map((g) => g.toLowerCase()) ?? [];
    authEnabled = config.auth?.enabled ?? false;
    freeEntry = config.auth?.freeEntry ?? false;
  } else if (options.auth) {
    admins = options.auth?.admins?.map((a) => a.toLowerCase()) ?? [];
    users = options.auth?.users?.map((u) => u.toLowerCase()) ?? [];
    guests = options.auth?.guests?.map((g) => g.toLowerCase()) ?? [];
    authEnabled = options.auth?.enabled ?? false;
    freeEntry = options.auth?.freeEntry ?? false;
  }
  const {
    AUTH_ENABLED,
    GUESTS,
    USERS,
    ADMINS,
    FREE_ENTRY,
    DOCUMENT_PERMISSIONS_ENABLED,
    SKIP_CREDENTIAL_VERIFICATION,
  } = process.env;
  if (AUTH_ENABLED !== undefined) {
    authEnabled = AUTH_ENABLED === "true";
  }
  if (GUESTS !== undefined) {
    guests = GUESTS.split(",").map((g) => g.toLowerCase());
  }
  if (USERS !== undefined) {
    users = USERS.split(",").map((u) => u.toLowerCase());
  }
  if (ADMINS !== undefined) {
    admins = ADMINS.split(",").map((a) => a.toLowerCase());
  }
  if (FREE_ENTRY !== undefined) {
    freeEntry = FREE_ENTRY === "true";
  }

  let skipCredentialVerification = false;
  if (SKIP_CREDENTIAL_VERIFICATION !== undefined) {
    skipCredentialVerification = SKIP_CREDENTIAL_VERIFICATION === "true";
  }

  const authService = new AuthService({
    enabled: authEnabled,
    guests,
    users,
    admins,
    freeEntry,
    skipCredentialVerification,
  });

  // Health check endpoint (before auth middleware)
  app.get("/health", (_req, res) => {
    res.status(200).send("OK");
  });

  // add auth middleware if auth is enabled
  if (authEnabled) {
    logger.info("Setting up Auth middleware");

    // Apply auth middleware to all routes including GraphQL
    app.use((req, res, next) => {
      authService.authenticate(req as AuthenticatedRequest, res, next);
    });
  }

  const defaultRouter = express.Router();
  setupGraphQlExplorer(defaultRouter);
  app.use(config.basePath, defaultRouter);

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
    );
    logger.info("Document permission service initialized");
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
    app,
    auth: {
      enabled: authEnabled,
      guests,
      users,
      admins,
      freeEntry,
    },
    relationalDb,
    analyticsStore,
    documentPermissionService,
    packages,
  };
}

/**
 * Private helper function containing common setup logic for API initialization
 */
async function _setupAPI(
  reactor: IDocumentDriveServer,
  reactorClient: IReactorClient,
  syncManager: ISyncManager,
  app: Express,
  port: number,
  packages: PackageManager,
  relationalDb: IRelationalDb,
  analyticsStore: IAnalyticsStore,
  documentPermissionService: DocumentPermissionService | undefined,
  processors: Map<
    string,
    ((module: IProcessorHostModule) => ProcessorFactory)[]
  >,
  subgraphs: Map<string, SubgraphClass[]>,
  options: Options,
  auth: {
    enabled: boolean;
    guests: string[];
    users: string[];
    admins: string[];
    freeEntry: boolean;
  },
): Promise<API> {
  const module: IProcessorHostModule = { relationalDb, analyticsStore };
  const mcpServerEnabled = options.mcp ?? true;

  // initialize processors
  const processorManager = new ProcessorManager(reactor.listeners, reactor);
  for (const [packageName, fns] of [
    ...processors.entries(),
    ...Object.entries(options.processors ?? {}),
  ]) {
    const factories = fns.map((fn) => {
      try {
        return fn({
          analyticsStore: module.analyticsStore,
          relationalDb: module.relationalDb,
          config: options.processorConfig,
        });
      } catch (e) {
        logger.error(
          `Error initializing processor factory for package ${packageName}:`,
          e,
        );

        return null;
      }
    });

    const validFactories = factories.filter(
      (factory): factory is ProcessorFactory =>
        factory !== null && typeof factory === "function",
    );

    if (!validFactories.length) {
      continue;
    }

    await processorManager.registerFactory(packageName, async (driveHeader) =>
      (
        await Promise.all(
          validFactories.map(async (factory) => {
            try {
              return await factory(driveHeader);
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

  // hook up processor manager to drive added event
  reactor.on("driveAdded", async (drive: DocumentDriveDocument) => {
    await processorManager.registerDrive(drive.header.id);
  });

  // Start the server
  const { httpServer, wsServer } = await startServer(app, port, options.https);

  // set up subgraph manager
  const coreSubgraphs: SubgraphClass[] = DefaultCoreSubgraphs.slice();

  // Register Auth subgraph when document permission service is available
  if (documentPermissionService) {
    coreSubgraphs.push(AuthSubgraph);
    logger.info("Auth subgraph registered (document permissions enabled)");
  }

  const graphqlManager = await setupGraphQLManager(
    app,
    httpServer,
    wsServer,
    reactor,
    reactorClient,
    relationalDb,
    analyticsStore,
    syncManager,
    {
      extended: subgraphs,
      core: coreSubgraphs,
    },
    auth,
    documentPermissionService,
    options.enableDocumentModelSubgraphs,
  );

  // Set up event listeners
  setupEventListeners(
    packages,
    reactor,
    graphqlManager,
    processorManager,
    module,
  );

  if (mcpServerEnabled) {
    await setupMcpServer(reactor, app);
    logger.info(`MCP server available at http://localhost:${port}/mcp`);
  }

  return {
    app,
    graphqlManager,
    processorManager,
    packages,
  };
}

/**
 * Starts the API server with pre-initialized drive server and client instances.
 *
 * @param driveServer - An already-initialized document drive server instance.
 * @param client - An already-initialized reactor client instance.
 * @param options - Additional options for server configuration.
 *
 * @returns The API server components.
 */
export async function startAPI(
  driveServer: IDocumentDriveServer,
  client: IReactorClient,
  registry: IDocumentModelRegistry,
  syncManager: ISyncManager,
  options: Options,
): Promise<API> {
  const {
    port,
    app,
    auth,
    relationalDb,
    analyticsStore,
    documentPermissionService,
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

  // pass to legacy reactor
  driveServer.setDocumentModelModules(
    getUniqueDocumentModels([
      ...driveServer.getDocumentModelModules(),
      ...documentModels,
    ]),
  );

  // pass to registry
  registry.registerModules(...documentModels);

  return _setupAPI(
    driveServer,
    client,
    syncManager,
    app,
    port,
    packages,
    relationalDb,
    analyticsStore,
    documentPermissionService,
    processors,
    subgraphs,
    options,
    auth,
  );
}

/**
 * Initializes and starts the API server using initializer functions.
 * This function first loads packages to get document models, then calls the initializer functions
 * to create the drive server and client instances with the appropriate dependencies.
 *
 * @param driveServerInitializer - Initializer function that creates the document drive server with document models.
 * @param clientInitializer - Initializer function that creates the reactor client and sync manager with the drive server.
 * @param options - Additional options for server configuration.
 *
 * @returns The API server components along with the created drive server and client instances.
 */
export async function initializeAndStartAPI(
  driveServerInitializer: (
    documentModelModules: DocumentModelModule[],
  ) => Promise<IDocumentDriveServer>,
  clientInitializer: (
    driveServer: IDocumentDriveServer,
    documentModels: DocumentModelModule[],
  ) => Promise<{ client: IReactorClient; syncManager: ISyncManager }>,
  options: Options,
): Promise<
  API & { driveServer: IDocumentDriveServer; client: IReactorClient }
> {
  const {
    port,
    app,
    auth,
    relationalDb,
    analyticsStore,
    documentPermissionService,
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

  const reactor = await trace(
    "reactor-api.drive-server.init",
    { tags: { "resource.name": "drive-server" } },
    () => driveServerInitializer(documentModels),
  );

  const { client: reactorClient, syncManager } = await trace(
    "reactor-api.reactor-client.init",
    { tags: { "resource.name": "reactor-client" } },
    () => clientInitializer(reactor, documentModels),
  );

  const api = await _setupAPI(
    reactor,
    reactorClient,
    syncManager,
    app,
    port,
    packages,
    relationalDb,
    analyticsStore,
    documentPermissionService,
    processors,
    subgraphs,
    options,
    auth,
  );

  return {
    ...api,
    driveServer: reactor,
    client: reactorClient,
  };
}
