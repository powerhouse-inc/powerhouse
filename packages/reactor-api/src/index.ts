import { BaseDocumentDriveServer, IDocumentDriveServer } from "document-drive";
import express, { Express } from "express";
import { router, updateRouter } from "./router";
import cors from "cors";
import bodyParser from "body-parser";

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
  app.use(cors());
  app.use(bodyParser.json());

  await updateRouter(reactor);
  reactor.on("documentModels", () => {
    updateRouter(reactor);
  });

  app.use("/graphql", router);

  app.listen(port);
}
