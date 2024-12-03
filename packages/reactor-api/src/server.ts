import { PGlite } from "@electric-sql/pglite";
import { IDocumentDriveServer } from "document-drive";
import express, { Express } from "express";
import pg from "pg";
const { Pool } = pg;
import { ReactorRouterManager } from "./router";

type Options = {
  express?: Express;
  port?: number;
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
  await reactorRouterManager.init();

  app.listen(port);

  return { app, reactorRouterManager };
}
