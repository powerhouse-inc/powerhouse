import { PGlite } from "@electric-sql/pglite";
import {
  KnexAnalyticsStore,
  KnexQueryExecutor,
} from "@powerhousedao/analytics-engine-knex";
import devcert from "devcert";
import { IDocumentDriveServer } from "document-drive";
import express, { Express } from "express";
import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { TlsOptions } from "node:tls";
import { Pool } from "pg";
import { IAnalyticsStore, ProcessorManager } from "#processors/index.js";
import { SubgraphManager } from "#subgraphs/manager.js";
import { API } from "./types.js";
import { getDbClient } from "./utils/db.js";

type Options = {
  express?: Express;
  port?: number;
  dbPath: string | undefined;
  client?: PGlite | typeof Pool | undefined;
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
  }) as unknown as IAnalyticsStore; // TODO update @powerhousedao/analytics-engine-pg to use @powerhousedao/analytics-engine-core@0.3.2
  const subgraphManager = new SubgraphManager(
    "/",
    app,
    reactor,
    db,
    analyticsStore,
  );
  await subgraphManager.init();
  const processorManager = new ProcessorManager(reactor, db, analyticsStore);

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
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
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
  return { app, subgraphManager, processorManager };
}
