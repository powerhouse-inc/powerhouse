import { PGlite } from "@electric-sql/pglite";
import { IDocumentDriveServer } from "document-drive";
import express, { Express } from "express";
import { Pool } from "pg";
import { ProcessorManager } from "./processors";
import { SubgraphManager } from "./subgraphs/manager";
import { API } from "./types";
import { getDbClient } from "./utils/get-db-client";
import {
  KnexAnalyticsStore,
  KnexQueryExecutor,
} from "@powerhousedao/analytics-engine-knex";
import { PostgresAnalyticsStore } from "@powerhousedao/analytics-engine-pg";
import { MemoryAnalyticsStore } from "@powerhousedao/analytics-engine-browser";
type Options = {
  express?: Express;
  port?: number;
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
  const getAnalyticsStore = async (dbPath: string | undefined) => {
    console.log("dbPath", dbPath);

    if (dbPath?.startsWith("postgres")) {
      const pgStore = new PostgresAnalyticsStore(dbPath);
      return pgStore;
    }

    const memoryStore = new MemoryAnalyticsStore();
    await memoryStore.init();

    return memoryStore;
  };
  const analyticsStore = await getAnalyticsStore(options.dbPath);
  const subgraphManager = new SubgraphManager(
    "/",
    app,
    reactor,
    db,
    analyticsStore,
  );
  await subgraphManager.init();
  const processorManager = new ProcessorManager(reactor, db, analyticsStore);

  app.listen(port);
  return { app, subgraphManager, processorManager };
}
