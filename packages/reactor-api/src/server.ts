import { config } from "#config.js";
import { GraphQLManager } from "#graphql/graphql-manager.js";
import { renderGraphqlPlayground } from "#graphql/playground.js";
import { ImportPackageLoader } from "#packages/import-loader.js";
import {
  getUniqueDocumentModels,
  PackageManager,
} from "#packages/package-manager.js";
import { type IPackageLoader } from "#packages/types.js";
import { type PGlite } from "@electric-sql/pglite";
import { type IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import { PostgresAnalyticsStore } from "@powerhousedao/analytics-engine-pg";
import { getConfig } from "@powerhousedao/config/utils";
import { setupMcpServer } from "@powerhousedao/reactor-mcp/express";
import { verifyAuthBearerToken } from "@renown/sdk";
import devcert from "devcert";
import {
  childLogger,
  type DocumentDriveDocument,
  type IDocumentDriveServer,
} from "document-drive";
import { ProcessorManager } from "document-drive/processors/processor-manager";
import {
  type IProcessorHostModule,
  type IProcessorManager,
  type IRelationalDb,
  type ProcessorFactory,
} from "document-drive/processors/types";
import { createRelationalDb } from "document-drive/processors/utils";
import express, { type Express } from "express";
import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { type TlsOptions } from "node:tls";
import { type Pool } from "pg";
import { type API, type Processor, type SubgraphClass } from "./types.js";
import { getDbClient, initAnalyticsStoreSql } from "./utils/db.js";

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
): Promise<{ relationalDb: IRelationalDb; analyticsStore: IAnalyticsStore }> {
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
  reactor: IDocumentDriveServer,
  relationalDb: IRelationalDb,
  analyticsStore: IAnalyticsStore,
  subgraphs: Map<string, SubgraphClass[]>,
  auth?: {
    enabled: boolean;
    guests: string[];
    users: string[];
    admins: string[];
  },
): Promise<GraphQLManager> {
  const graphqlManager = new GraphQLManager(
    config.basePath,
    app,
    reactor,
    relationalDb,
    analyticsStore,
  );

  await graphqlManager.init();

  for (const [, collection] of subgraphs.entries()) {
    for (const subgraph of collection) {
      await graphqlManager.registerSubgraph(subgraph, "graphql");
    }
  }

  await graphqlManager.updateRouter();
  if (auth?.enabled) {
    graphqlManager.setAdditionalContextFields({
      isGuest: (address: string) =>
        auth.enabled && auth.guests?.includes(address.toLowerCase()),
      isUser: (address: string) =>
        auth.enabled && auth.users?.includes(address.toLowerCase()),
      isAdmin: (address: string) =>
        auth.enabled && auth.admins?.includes(address.toLowerCase()),
    });
  } else {
    graphqlManager.setAdditionalContextFields({
      isGuest: (address: string) => true,
      isUser: (address: string) => true,
      isAdmin: (address: string) => true,
    });
  }
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
    const uniqueModels = getUniqueDocumentModels([
      ...reactor.getDocumentModelModules(),
      ...Object.values(documentModels).flat(),
    ]);
    reactor.setDocumentModelModules(uniqueModels);
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
          await Promise.all(factories.map((factory) => factory(driveHeader)))
        ).flat(),
      );
    }
  });
}

/**
 * Starts the server (HTTP or HTTPS)
 */
async function startServer(
  app: Express,
  port: number,
  httpsOptions: Options["https"],
): Promise<void> {
  if (httpsOptions) {
    const currentDir = process.cwd();
    let server: https.Server;

    if (typeof httpsOptions === "object") {
      server = https.createServer(
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
        server = https.createServer({ cert, key }, app);
      } catch (err) {
        console.error("Failed to get HTTPS certificate:", err);
        throw new Error("Failed to start HTTPS server");
      }
    }
    server.listen(port);
  } else {
    app.listen(port);
  }
}

/**
 * Starts the API server.
 *
 * @param reactor - The document drive server.
 * @param options - Additional options for server configuration. These options intended to be serializable.
 * @param overrides - System overrides. These overrides are intended to be object references.
 *
 * @returns The API server.
 */
export async function startAPI(
  reactor: IDocumentDriveServer,
  options: Options,
): Promise<API> {
  const port = options.port ?? DEFAULT_PORT;
  const app = options.express ?? express();
  const mcpServerEnabled = options.mcp ?? true;

  let admins: string[] = [];
  let users: string[] = [];
  let guests: string[] = [];
  let authEnabled = false;

  if (options.configFile) {
    const config = getConfig(options.configFile);
    admins = config.auth?.admins?.map((a) => a.toLowerCase()) ?? [];
    users = config.auth?.users?.map((u) => u.toLowerCase()) ?? [];
    guests = config.auth?.guests?.map((g) => g.toLowerCase()) ?? [];
    authEnabled = config.auth?.enabled ?? false;
  } else if (options.auth) {
    admins = options.auth?.admins?.map((a) => a.toLowerCase()) ?? [];
    users = options.auth?.users?.map((u) => u.toLowerCase()) ?? [];
    guests = options.auth?.guests?.map((g) => g.toLowerCase()) ?? [];
    authEnabled = options.auth?.enabled ?? false;
  }
  const { AUTH_ENABLED, GUESTS, USERS, ADMINS } = process.env;
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

  const all = [...admins, ...users, ...guests];

  // add auth middleware if auth is enabled
  if (authEnabled) {
    // set admin, users and guest list
    logger.info("Setting up Auth middleware");
    app.use(async (req, res, next) => {
      if (!authEnabled || req.method === "OPTIONS" || req.method === "GET") {
        next();
        return;
      }

      req.admins = admins;
      req.users = users;
      req.guests = guests;

      const token = req.headers.authorization?.split(" ")[1];
      if (!token) {
        res.status(400).json({ error: "Missing authorization token" });
        return;
      }

      const verified = await verifyAuthBearerToken(token);
      if (!verified) {
        res.status(401).json({ error: "Verification failed" });
        return;
      }

      const { address, chainId, networkId } = verified.verifiableCredential
        .credentialSubject as {
        address: string;
        chainId: number;
        networkId: string;
      };

      // @todo: check renown eth credential

      if (!address || !chainId || !networkId) {
        res.status(401).json({ error: "Missing credentials" });
        return;
      }
      req.user = {
        address: address.toLowerCase(),
        chainId,
        networkId,
      };

      graphqlManager.setAdditionalContextFields({
        user: {
          address: address.toLowerCase(),
          chainId,
          networkId,
        },
      });

      if (!all.includes(req.user.address)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      next();
    });
  }

  const defaultRouter = express.Router();
  setupGraphQlExplorer(defaultRouter);
  app.use(config.basePath, defaultRouter);

  // Initialize database and analytics store
  const { relationalDb, analyticsStore } = await initializeDatabaseAndAnalytics(
    options.dbPath,
  );
  const module: IProcessorHostModule = { relationalDb, analyticsStore };

  // Initialize package manager
  const loaders: IPackageLoader[] = [new ImportPackageLoader()];
  if (options.packageLoader) {
    loaders.push(options.packageLoader);
  }

  const packages = new PackageManager(loaders, {
    configFile: options.configFile,
    packages: options.packages ?? [],
  });

  const { documentModels, processors, subgraphs } = await packages.init();

  // set document model modules here, processors might use them immediately
  reactor.setDocumentModelModules(
    getUniqueDocumentModels([
      ...reactor.getDocumentModelModules(),
      ...documentModels,
    ]),
  );

  // initialize processors
  const processorManager = new ProcessorManager(reactor.listeners, reactor);
  for (const [packageName, fns] of [
    ...processors.entries(),
    ...Object.entries(options.processors ?? {}),
  ]) {
    const factories = fns.map((fn) => {
      try {
        return fn({
          // TODO: figure out why this type comes out as any
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          analyticsStore: module.analyticsStore,
          relationalDb: module.relationalDb,
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

  // set up subgraph manager
  const graphqlManager = await setupGraphQLManager(
    app,
    reactor,
    relationalDb,
    analyticsStore,
    subgraphs,
    {
      enabled: authEnabled,
      guests,
      users,
      admins,
    },
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

  // Start the server
  await startServer(app, port, options.https);

  return { app, graphqlManager, processorManager, packages };
}
