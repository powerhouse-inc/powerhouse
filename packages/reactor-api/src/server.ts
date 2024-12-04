import { PGlite } from "@electric-sql/pglite";
import {
  AnalyticsQueryEngine
} from "@powerhousedao/analytics-engine-core";
import { AnalyticsModel } from "@powerhousedao/analytics-engine-graphql";
import { KnexAnalyticsStore, KnexQueryExecutor } from "@powerhousedao/analytics-engine-knex";
import { IDocumentDriveServer } from "document-drive";
import express, { Express } from "express";
import pg from "pg";
import { ReactorRouterManager } from "./router";
import { getKnexClient } from "./utils/get-knex-client";
const { Pool } = pg;

type Options = {
  express?: Express;
  port?: number;
  dbConnection: string | undefined;
  client?: PGlite | typeof Pool | undefined;
};

const DEFAULT_PORT = 4000;

export async function startAPI(
  reactor: IDocumentDriveServer,
  options: Options
) {
  const port = options.port ?? DEFAULT_PORT;
  const app = options.express ?? express();

  const reactorRouterManager = new ReactorRouterManager(
    "/",
    app,
    reactor,
    options.client
  );

  // add analytics endpoints
  const knex = await getKnexClient(options.dbConnection ?? "./dev.db");
  reactorRouterManager.setAdditionalContextFields({
    dataSources: {
      db: {
        Analytics: new AnalyticsModel(new AnalyticsQueryEngine(new KnexAnalyticsStore({
          executor: new KnexQueryExecutor(),
            knex,
          })),
        ),
      },
    },
  });
  await reactorRouterManager.init();
  app.listen(port);
  return { app, reactorRouterManager };
}
