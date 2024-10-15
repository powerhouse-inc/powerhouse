import { DocumentDriveServer } from "document-drive";
import * as DocumentModelsLibs from "document-model-libs/document-models";
import { DocumentModel } from "document-model/document";
import { module as DocumentModelLib } from "document-model/document-model";
import dotenv from "dotenv";
import { drizzle } from "drizzle-orm/connect";
import { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import express from "express";
import http from "http";
import { initReactorRouter, reactorRouter } from "reactor-api";
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
    await initReactorRouter(driveServer);
    app.use("/graphql", reactorRouter);

    // start http server
    httpServer.listen({ port: serverPort }, () => {
      console.log(`Subgraph server listening on port ${serverPort}`);
    });
  } catch (e) {
    console.error("App crashed", e);
  }
};

main().catch(console.error);
