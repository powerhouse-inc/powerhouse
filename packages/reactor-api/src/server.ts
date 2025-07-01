import { config } from "#config.js";
import { GraphQLManager } from "#graphql/graphql-manager.js";
import { renderGraphqlPlayground } from "#graphql/playground.js";
import { ImportPackageLoader } from "#packages/import-loader.js";
import {
  getUniqueDocumentModels,
  PackageManager,
} from "#packages/package-manager.js";
import {
  type IPackageLoader,
  type IProcessorHostModule,
} from "#packages/types.js";
import { type PGlite } from "@electric-sql/pglite";
import { type IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import { PostgresAnalyticsStore } from "@powerhousedao/analytics-engine-pg";
import { verifyAuthBearerToken } from "@renown/sdk";
import devcert from "devcert";
import {
  childLogger,
  type DocumentDriveDocument,
  type IDocumentDriveServer,
} from "document-drive";
import { ProcessorManager } from "document-drive/processors/processor-manager";
import {
  type IProcessorManager,
  type ProcessorFactory,
} from "document-drive/processors/types";
import express, { type Express } from "express";
import { type Knex } from "knex";
import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { type TlsOptions } from "node:tls";
import { type Pool } from "pg";
import { type API, type SubgraphClass } from "./types.js";
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
  processors?: Record<
    string,
    ((module: IProcessorHostModule) => ProcessorFactory)[]
  >;
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
): Promise<{ db: Knex; analyticsStore: IAnalyticsStore }> {
  const db = getDbClient(dbPath);
  const analyticsStore = new PostgresAnalyticsStore({
    knex: db,
  });

  for (const sql of initAnalyticsStoreSql) {
    await db.raw(sql);
  }

  return { db, analyticsStore };
}

/**
 * Sets up the subgraph manager and registers subgraphs
 */
async function setupGraphQLManager(
  app: Express,
  reactor: IDocumentDriveServer,
  db: Knex,
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
    db,
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
        auth.enabled && auth.guests.includes(address),
      isUser: (address: string) => auth.enabled && auth.users.includes(address),
      isAdmin: (address: string) =>
        auth.enabled && auth.admins.includes(address),
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
  module: { db: Knex; analyticsStore: IAnalyticsStore },
): void {
  pkgManager.onDocumentModelsChange(async (documentModels) => {
    const uniqueModels = getUniqueDocumentModels(
      Object.values(documentModels).flat(),
    );
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

      const factories = fns.map((fn) => fn(module));

      await processorManager.registerFactory(packageName, (driveId: string) =>
        factories.map((factory) => factory(driveId)).flat(),
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
  const admins = options.auth?.admins.map((a) => a.toLowerCase()) ?? [];
  const users = options.auth?.users.map((u) => u.toLowerCase()) ?? [];
  const guests = options.auth?.guests.map((g) => g.toLowerCase()) ?? [];

  const all = [...admins, ...users, ...guests];

  // add auth middleware if auth is enabled
  if (options.auth?.enabled) {
    // set admin, users and guest list
    app.use(async (req, res, next) => {
      if (!options.auth || req.method === "OPTIONS" || req.method === "GET") {
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

      if (!all.includes(req.user.address)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      req.user = {
        address,
        chainId,
        networkId,
      };

      next();
    });
  }

  const defaultRouter = express.Router();
  setupGraphQlExplorer(defaultRouter);
  app.use(config.basePath, defaultRouter);

  // Initialize database and analytics store
  const { db, analyticsStore } = await initializeDatabaseAndAnalytics(
    options.dbPath,
  );
  const module = { db, analyticsStore };

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
  for (const [packageName, fns] of processors) {
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
      (factory): factory is ProcessorFactory =>
        factory !== null && typeof factory === "function",
    );

    if (!validFactories.length) {
      continue;
    }

    await processorManager.registerFactory(packageName, (driveId: string) =>
      validFactories
        .map((factory) => {
          try {
            return factory(driveId);
          } catch (e) {
            logger.error(`Error creating processor for drive ${driveId}:`, e);

            return [];
          }
        })
        .flat(),
    );
  }

  // hook up processor manager to drive added event
  reactor.on("driveAdded", async (drive: DocumentDriveDocument) => {
    await processorManager.registerDrive(drive.id);
  });

  // set up subgraph manager
  const graphqlManager = await setupGraphQLManager(
    app,
    reactor,
    db,
    analyticsStore,
    subgraphs,
    options.auth,
  );

  // Set up event listeners
  setupEventListeners(
    packages,
    reactor,
    graphqlManager,
    processorManager,
    module,
  );

  // Start the server
  await startServer(app, port, options.https);

  return { app, graphqlManager, processorManager, packages };
}
