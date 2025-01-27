import { PGlite } from "@electric-sql/pglite";
import {
  KnexAnalyticsStore,
  KnexQueryExecutor,
} from "@powerhousedao/analytics-engine-knex";
import { IDocumentDriveServer } from "document-drive";
import express, { Express } from "express";
import fs from "node:fs";
import https from "node:https";
import { Pool } from "pg";
import { ProcessorManager } from "./processors";
import { SubgraphManager } from "./subgraphs/manager";
import { API } from "./types";
import { getDbClient } from "./utils/db";

type Options = {
  express?: Express;
  port?: number;
  dbPath: string | undefined;
  client?: PGlite | typeof Pool | undefined;
  https?: {
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

  if (options.https) {
    const server = https.createServer(
      {
        key: fs.readFileSync(options.https.keyPath),
        cert: fs.readFileSync(options.https.certPath),
      },
      app,
    );
    server.listen(port);
  } else {
    app.listen(port);
  }
  return { app, subgraphManager, processorManager };
}
