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
import {
  KnexAnalyticsStore,
  KnexQueryExecutor,
} from "@powerhousedao/analytics-engine-knex";
import devcert from "devcert";
import {
  childLogger,
  type DocumentDriveDocument,
  type IDocumentDriveServer,
} from "document-drive";
import { ProcessorManager } from "document-drive/processors/processor-manager";
import { type IProcessorManager } from "document-drive/processors/types";
import express, { type Express } from "express";
import { type Knex } from "knex";
import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { type TlsOptions } from "node:tls";
import { type Pool } from "pg";
import { type API, type SubgraphClass } from "./types.js";
import { getDbClient } from "./utils/db.js";

const logger = childLogger(["reactor-api", "server"]);

type Options = {
  express?: Express;
  port?: number;
  dbPath: string | undefined;
  client?: PGlite | typeof Pool | undefined;
  configFile?: string;
  packages?: string[];
  https?:
    | {
        keyPath: string;
        certPath: string;
      }
    | boolean
    | undefined;
  packageLoader?: IPackageLoader;
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
function initializeDatabaseAndAnalytics(dbPath: string | undefined): {
  db: Knex;
  analyticsStore: IAnalyticsStore;
} {
  const db = getDbClient(dbPath);
  const analyticsStore = new KnexAnalyticsStore({
    executor: new KnexQueryExecutor(),
    knex: db,
  }) as unknown as IAnalyticsStore;

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
): Promise<GraphQLManager> {
  const graphqlManager = new GraphQLManager(
    config.basePath,
    app,
    reactor,
    db,
    analyticsStore,
  );

  await graphqlManager.init();

  for (const [supergraph, collection] of subgraphs.entries()) {
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
  module: { db: Knex; analyticsStore: IAnalyticsStore },
): void {
  pkgManager.onDocumentModelsChange((documentModels) => {
    const uniqueModels = getUniqueDocumentModels(
      Object.values(documentModels).flat(),
    );
    reactor.setDocumentModelModules(uniqueModels);
    graphqlManager.updateRouter();
  });

  pkgManager.onSubgraphsChange((packagedSubgraphs) => {
    for (const [supergraph, subgraphs] of packagedSubgraphs) {
      for (const subgraph of subgraphs) {
        graphqlManager.registerSubgraph(subgraph, "graphql");
      }
    }
    graphqlManager.updateRouter();
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

  const defaultRouter = express.Router();
  setupGraphQlExplorer(defaultRouter);
  app.use(config.basePath, defaultRouter);

  // Initialize database and analytics store
  const { db, analyticsStore } = initializeDatabaseAndAnalytics(options.dbPath);
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

        return () => [];
      }
    });

    await processorManager.registerFactory(packageName, (driveId: string) =>
      factories
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
    await processorManager.registerDrive(drive.state.global.id);
  });

  // set up subgraph manager
  const graphqlManager = await setupGraphQLManager(
    app,
    reactor,
    db,
    analyticsStore,
    subgraphs,
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
