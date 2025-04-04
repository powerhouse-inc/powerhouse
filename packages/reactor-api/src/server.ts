import { type SubgraphClass } from "#graphql/index.js";
import { SubgraphManager } from "#graphql/manager.js";
import { renderGraphqlPlayground } from "#graphql/playground.js";
import { getUniqueDocumentModels, PackagesManager } from "#package-manager.js";
import { type PGlite } from "@electric-sql/pglite";
import { type IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import {
  KnexAnalyticsStore,
  KnexQueryExecutor,
} from "@powerhousedao/analytics-engine-knex";
import devcert from "devcert";
import { type IDocumentDriveServer } from "document-drive";
import { type DocumentModelModule } from "document-model";
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

type PackageManagerResult = {
  documentModels?: DocumentModelModule[];
  subgraphs?: Map<string, SubgraphClass[]>;
};

const DEFAULT_PORT = 4000;

/**
 * Sets up the Express app with necessary routes
 */
function setupGraphQlExplorer(app: Express): void {
  app.get("/explorer/:endpoint?", (req, res) => {
    res.setHeader("Content-Type", "text/html");
    const basePath =
      process.env.BASE_PATH === "/" ? "" : process.env.BASE_PATH || "";
    const endpoint = `${basePath}${req.params.endpoint !== undefined ? `/${req.params.endpoint}` : "/graphql"}`;

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
async function setupSubgraphManager(
  app: Express,
  reactor: IDocumentDriveServer,
  db: Knex,
  analyticsStore: IAnalyticsStore,
  result: PackageManagerResult,
): Promise<SubgraphManager> {
  const subgraphManager = new SubgraphManager(
    "/",
    app,
    reactor,
    db,
    analyticsStore,
  );

  await subgraphManager.init();

  if (result.subgraphs) {
    for (const [supergraph, subgraphs] of result.subgraphs.entries()) {
      for (const subgraph of subgraphs) {
        subgraphManager.registerSubgraph(subgraph, supergraph);
      }
    }
  }

  return subgraphManager;
}

/**
 * Sets up event listeners for package manager changes
 */
function setupEventListeners(
  pkgManager: PackagesManager,
  reactor: IDocumentDriveServer,
  subgraphManager: SubgraphManager,
): void {
  pkgManager.onDocumentModelsChange((documentModels) => {
    const uniqueModels = getUniqueDocumentModels(
      Object.values(documentModels).flat(),
    );
    reactor.setDocumentModelModules(uniqueModels);
    subgraphManager.updateRouter();
  });

  pkgManager.onSubgraphsChange((packagedSubgraphs) => {
    for (const [supergraph, subgraphs] of packagedSubgraphs) {
      for (const subgraph of subgraphs) {
        subgraphManager.registerSubgraph(subgraph, supergraph);
      }
    }
  });

  pkgManager.onListenersChange((listeners) => {
    Object.entries(listeners).forEach(([packageName, packageListeners]) => {
      packageListeners.forEach((listener) => {
        if (!listener.driveId) {
          console.warn(
            `Skipping listener ${listener.listenerId} from package ${packageName} - missing driveId`,
          );
          return;
        }
        reactor.listeners
          .setListener(listener.driveId, listener)
          .catch((error) => {
            console.error(
              `Failed to set listener ${listener.listenerId} for drive ${listener.driveId}:`,
              error,
            );
          });
      });
    });
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

  // Set up Express app with routes
  setupGraphQlExplorer(app);

  // Initialize database and analytics store
  const { db, analyticsStore } = initializeDatabaseAndAnalytics(options.dbPath);

  // Initialize package manager
  const { pkgManager, result } = await initializePackageManager(options);
  const documentModels = result.documentModels ?? [];

  // Set document model modules
  reactor.setDocumentModelModules(
    getUniqueDocumentModels([
      ...reactor.getDocumentModelModules(),
      ...documentModels,
    ]),
  );

  // Set up subgraph manager
  const subgraphManager = await setupSubgraphManager(
    app,
    reactor,
    db,
    analyticsStore,
    result,
  );

  // Set up event listeners
  setupEventListeners(pkgManager, reactor, subgraphManager);

  // Start the server
  await startServer(app, port, options.https);

  return { app, subgraphManager };
}
