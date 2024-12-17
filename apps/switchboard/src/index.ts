import { Db, SubgraphManager, getDbClient } from "@powerhousedao/reactor-api";
import { DocumentDriveServer } from "document-drive";
import * as DocumentModelsLibs from "document-model-libs/document-models";
import { DocumentModel } from "document-model/document";
import { module as DocumentModelLib } from "document-model/document-model";
import dotenv from "dotenv";
import express from "express";
import http from "http";
import path from "path";
import { Knex } from "knex";
dotenv.config();

// start document drive server with all available document models
const driveServer = new DocumentDriveServer([
  DocumentModelLib,
  ...Object.values(DocumentModelsLibs),
] as DocumentModel[]);

// Create a monolith express app for all subgraphs
const app = express();
const serverPort = process.env.PORT ? Number(process.env.PORT) : 4001;
const httpServer = http.createServer(app);
let db: any;
const main = async () => {
  try {
    // init drive server
    await driveServer.initialize();

    const dbPath = process.env.DATABASE_URL ?? undefined;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
    const knex = getDbClient(dbPath);
    const reactorRouterManager = new SubgraphManager(
      "/",
      app,
      driveServer,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      knex,
    );
    // init router
    await reactorRouterManager.init();

    // @TODO: add auth listener
    // await reactorRouterManager.addSubgraph({
    //   ...authListener,
    // });

    // load switchboard-gui
    app.use(
      express.static(
        path.join(
          __dirname,
          "../node_modules/@powerhousedao/switchboard-gui/dist",
        ),
      ),
    );

    // start http server
    httpServer.listen({ port: serverPort }, () => {
      console.log(`Subgraph server listening on port ${serverPort}`);
    });
  } catch (e) {
    console.error("App crashed", e);
  }
};

main().catch(console.error);
