import * as searchListener from "@powerhousedao/general-document-indexer";
import { ReactorRouterManager } from "@powerhousedao/reactor-api";
import { DocumentDriveServer } from "document-drive";
import * as DocumentModelsLibs from "document-model-libs/document-models";
import { DocumentModel } from "document-model/document";
import { module as DocumentModelLib } from "document-model/document-model";
import dotenv from "dotenv";
import express from "express";
import http from "http";
import path from "path";
import { Pool } from "pg";
import * as authListener from "./subgraphs/auth";
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

    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
    await pool.connect();
    const reactorRouterManager = new ReactorRouterManager(
      "/",
      app,
      driveServer,
      pool,
    );
    // init router
    await reactorRouterManager.init();

    await reactorRouterManager.registerProcessor({
      ...searchListener,
      transmit(strands) {
        return searchListener.transmit(strands, db);
      },
      name: "search/:drive",
    });

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
