import { IDocumentDriveServer } from "document-drive";
import express, { Express } from "express";
import { initReactorRouter } from "./router";
type Options = {
  express?: Express;
  port?: number;
};

const DEFAULT_PORT = 4000;

export async function startAPI(
  reactor: IDocumentDriveServer,
  options: Options,
) {
  const port = options.port ?? DEFAULT_PORT;
  const app = options.express ?? express();

  await initReactorRouter("/", app, reactor);

  app.listen(port);

  return app;
}
