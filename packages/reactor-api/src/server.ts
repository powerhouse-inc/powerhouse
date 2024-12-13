import { PGlite } from "@electric-sql/pglite";
import { AnalyticsQueryEngine } from "@powerhousedao/analytics-engine-core";
import { AnalyticsModel } from "@powerhousedao/analytics-engine-graphql";
import {
  KnexAnalyticsStore,
  KnexQueryExecutor,
} from "@powerhousedao/analytics-engine-knex";
import { IDocumentDriveServer } from "document-drive";
import express, { Express } from "express";
import { Pool } from "pg";
import { ReactorRouterManager } from "./router";
import { getKnexClient } from "./utils/get-knex-client";
import { ProcessorManager } from "./processor-manager";
import { API } from "./types";
import { initialize } from "./subgraphs/analytics";

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

  const knex = getKnexClient(options.dbPath);
  await initialize(knex);

  const analyticsStore = new KnexAnalyticsStore({
    executor: new KnexQueryExecutor(),
    knex,
  });
  const reactorRouterManager = new ReactorRouterManager("/", app, reactor);
  reactorRouterManager.setAdditionalContextFields({
    dataSources: {
      db: {
        Analytics: new AnalyticsModel(new AnalyticsQueryEngine(analyticsStore)),
        Operational: knex,
      },
    },
  });
  await reactorRouterManager.init();
  const processorManager = new ProcessorManager(reactor, analyticsStore);

  app.listen(port);
  return { app, reactorRouterManager, processorManager };
}
