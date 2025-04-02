import { getUniqueDocumentModels, PackagesManager } from "#package-manager.js";
import { SubgraphManager } from "#subgraphs/manager.js";
import { type PGlite } from "@electric-sql/pglite";
import { type IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import {
  KnexAnalyticsStore,
  KnexQueryExecutor,
} from "@powerhousedao/analytics-engine-knex";
import devcert from "devcert";
import { type IDocumentDriveServer } from "document-drive";
import express, { type Express } from "express";
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

export async function startAPI(
  reactor: IDocumentDriveServer,
  options: Options,
): Promise<API> {
  const port = options.port ?? DEFAULT_PORT;
  const app = options.express ?? express();
  const db = getDbClient(options.dbPath);
  const analyticsStore = new KnexAnalyticsStore({
    executor: new KnexQueryExecutor(),
    knex: db,
  }) as unknown as IAnalyticsStore;

  const pkgManager = new PackagesManager(
    options.configFile
      ? {
          configFile: options.configFile,
        }
      : {
          packages: options.packages ?? [],
        },
  );
  const result = await pkgManager.init();
  const documentModels = result?.documentModels ?? [];

  reactor.setDocumentModelModules(
    getUniqueDocumentModels([
      ...reactor.getDocumentModelModules(),
      ...documentModels,
    ]),
  );

  const subgraphManager = new SubgraphManager(
    "/",
    app,
    reactor,
    db,
    analyticsStore,
    result?.subgraphs ? result.subgraphs : undefined,
  );
  await subgraphManager.init();

  pkgManager.onDocumentModelsChange((documentModels) => {
    const uniqueModels = getUniqueDocumentModels(
      Object.values(documentModels).flat(),
    );
    reactor.setDocumentModelModules(uniqueModels);
    subgraphManager.updateRouter();
  });

  pkgManager.onSubgraphsChange((packagedSubgraphs) => {
    for (const [supergraph, subgraphs] of packagedSubgraphs) {
      subgraphManager.setSupergraph(supergraph, subgraphs);
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

  if (options.https) {
    const currentDir = process.cwd();
    let server: https.Server;

    if (typeof options.https === "object") {
      server = https.createServer(
        {
          key: fs.readFileSync(path.join(currentDir, options.https.keyPath)),
          cert: fs.readFileSync(path.join(currentDir, options.https.certPath)),
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
  return { app, subgraphManager };
}
