import { BaseDocumentDriveServer } from "document-drive";
import express, { Express } from "express";
import { initReactorRouter, reactorRouter } from "./router";

type Options = {
  express?: Express;
  port?: number;
};

const DEFAULT_PORT = 4000;

export async function startAPI(
  reactor: BaseDocumentDriveServer,
  options: Options
) {
  const port = options.port ?? DEFAULT_PORT;
  const app = options.express ?? express();

  await initReactorRouter("/graphql", app, reactor);

  app.listen(port);
}
