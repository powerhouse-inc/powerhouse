import { config } from "#config.js";
import { GraphQLManager } from "#graphql/graphql-manager.js";
import { renderGraphqlPlayground } from "#graphql/playground.js";
import {
  getUniqueDocumentModels,
  PackagesManager,
  type PackageManagerResult,
} from "#package-manager.js";
import { type PGlite } from "@electric-sql/pglite";
import { type IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import {
  KnexAnalyticsStore,
  KnexQueryExecutor,
} from "@powerhousedao/analytics-engine-knex";
import devcert from "devcert";
import { type IDocumentDriveServer } from "document-drive";
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
import { type API } from "./types.js";
import { getDbClient } from "./utils/db.js";

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
 * Initializes the package manager and returns the result
 */
async function initializePackageManager(
  options: Options,
): Promise<{ pkgManager: PackagesManager; result: PackageManagerResult }> {
  const pkgManager = new PackagesManager(
    options.configFile
      ? {
          configFile: options.configFile,
        }
      : {
          packages: options.packages ?? [],
        },
  );

  const result = (await pkgManager.init()) as unknown as PackageManagerResult;
  return { pkgManager, result };
}

/**
 * Sets up the subgraph manager and registers subgraphs
 */
async function setupGraphQLManager(
  app: Express,
  reactor: IDocumentDriveServer,
  db: Knex,
  analyticsStore: IAnalyticsStore,
  result: PackageManagerResult,
): Promise<GraphQLManager> {
  const graphqlManager = new GraphQLManager(
    config.basePath,
    app,
    reactor,
    db,
    analyticsStore,
  );

  if (result.subgraphs) {
    for (const [supergraph, subgraphs] of result.subgraphs.entries()) {
      for (const subgraph of subgraphs) {
        await graphqlManager.registerSubgraph(subgraph, supergraph);
      }
    }
  }

  await graphqlManager.init();
  return graphqlManager;
}

/**
 * Sets up event listeners for package manager changes
 */
function setupEventListeners(
  pkgManager: PackagesManager,
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
        graphqlManager.registerSubgraph(subgraph, supergraph);
      }
    }
    graphqlManager.updateRouter();
  });

  pkgManager.onProcessorsChange(async (processors) => {
    for (const [packageName, fn] of processors) {
      await processorManager.unregisterFactory(packageName);

      const factory = fn(module);
      await processorManager.registerFactory(packageName, factory);
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
  const { pkgManager, result } = await initializePackageManager(options);
  const documentModels = result.documentModels ?? [];

  // initialize processors
  const processorManager = new ProcessorManager(reactor.listeners, reactor);

  const packageToProcessorFactory =
    result.processors ?? new Map<string, (module: any) => ProcessorFactory>();
  for (const [packageName, fn] of packageToProcessorFactory) {
    const factory = fn(module);
    processorManager.registerFactory(packageName, factory);
  }

  // Set document model modules
  reactor.setDocumentModelModules(
    getUniqueDocumentModels([
      ...reactor.getDocumentModelModules(),
      ...documentModels,
    ]),
  );

  // Set up subgraph manager
  const graphqlManager = await setupGraphQLManager(
    app,
    reactor,
    db,
    analyticsStore,
    result,
  );

  // Set up event listeners
  setupEventListeners(
    pkgManager,
    reactor,
    graphqlManager,
    processorManager,
    module,
  );

  // Start the server
  await startServer(app, port, options.https);

  return { app, graphqlManager, processorManager };
}
