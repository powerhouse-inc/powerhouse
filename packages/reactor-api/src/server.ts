import { PGlite } from "@electric-sql/pglite";
import { IDocumentDriveServer } from "document-drive";
import express, { Express } from "express";
import { Pool } from "pg";
import { ProcessorManager } from "./processors";
import { SubgraphManager } from "./subgraphs/manager";
import { API } from "./types";
import { getDbClient } from "./utils/db";
import {
  KnexAnalyticsStore,
  KnexQueryExecutor,
} from "@powerhousedao/analytics-engine-knex";
import https from "https";
import fs from "fs";

type Options = {
  express?: Express;
  port?: number;
  dbPath: string | undefined;
  client?: PGlite | typeof Pool | undefined;
  ssl?: {
    keyPath: string;
    certPath: string;
  };
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
  });
  const subgraphManager = new SubgraphManager(
    "/",
    app,
    reactor,
    db,
    analyticsStore,
  );
  await subgraphManager.init();
  const processorManager = new ProcessorManager(reactor, db, analyticsStore);

  if (options.ssl) {
    const server = https.createServer(
      {
        key: fs.readFileSync(options.ssl.keyPath),
        cert: fs.readFileSync(options.ssl.certPath),
      },
      app,
    );
    server.listen(port);
  } else {
    app.listen(port);
  }
  return { app, subgraphManager, processorManager };
}
