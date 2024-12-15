import { PGlite } from "@electric-sql/pglite";
import { IDocumentDriveServer } from "document-drive";
import express, { Express } from "express";
import { Pool } from "pg";
import { ProcessorManager } from "./processor-manager";
import { SubgraphManager } from "./subgraphs/manager";
import { API } from "./types";
import { getKnexClient } from "./utils/get-knex-client";

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
  const subgraphManager = new SubgraphManager("/", app, reactor, knex);
  await subgraphManager.init();
  const processorManager = new ProcessorManager(reactor, knex);

  app.listen(port);
  return { app, subgraphManager, processorManager };
}
