import { DocumentDriveServer } from "document-drive";
import * as DocumentModelsLibs from "document-model-libs/document-models";
import { DocumentModel } from "document-model/document";
import { module as DocumentModelLib } from "document-model/document-model";
import dotenv from "dotenv";
import { drizzle } from "drizzle-orm/connect";
import express from "express";
import http from "http";
import { addSubgraph, initReactorRouter } from "reactor-api";
import { getSchema as getSearchSchema } from "./subgraphs/search/subgraph";
import { InternalListenerManager } from "./utils/internal-listener-manager";
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
    // init db
    if (process.env.DATABASE_URL && process.env.DATABASE_URL !== "") {
      db = await drizzle("node-postgres", process.env.DATABASE_URL);
    } else {
      db = await drizzle("pglite", "./dev.db");
    }

    // init drive server
    await driveServer.initialize();

    // init listener manager
    const listenerManager = new InternalListenerManager(driveServer);
    await listenerManager.init();

    // init router
    await initReactorRouter("/graphql", app, driveServer);

    // start http server
    httpServer.listen({ port: serverPort }, () => {
      console.log(`Subgraph server listening on port ${serverPort}`);

      // add example subgraph
      addSubgraph(
        {
          name: ":drive/search",
          getSchema: (driveServer) => getSearchSchema(driveServer),
        },
        driveServer
      );
    });
  } catch (e) {
    console.error("App crashed", e);
  }
};

main().catch(console.error);
