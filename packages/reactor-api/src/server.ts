import { PGlite } from "@electric-sql/pglite";
import { IDocumentDriveServer } from "document-drive";
import express, { Express } from "express";
import { Pool } from "pg";
import { ProcessorManager } from "./processors";
import { SubgraphManager } from "./subgraphs/manager";
import { API } from "./types";
import { getDbClient } from "./utils/db";
import http from "http";
import https from "https";
import {
  KnexAnalyticsStore,
  KnexQueryExecutor,
} from "@powerhousedao/analytics-engine-knex";

type Options = {
  express?: Express;
  port?: number;
  host?: string;
  https?: boolean;
  dbPath: string | undefined;
  client?: PGlite | typeof Pool | undefined;
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

  let server: http.Server | https.Server;
  if (options.https) {
    server = https.createServer(app).listen(port);
  } else {
    server = http.createServer(app).listen(port);
  }
  return { app, subgraphManager, processorManager, server };
}
