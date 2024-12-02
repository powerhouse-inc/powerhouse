import { DocumentDriveServer } from "document-drive";
import * as DocumentModelsLibs from "document-model-libs/document-models";
import { FilesystemStorage } from "document-drive/storage/filesystem";
import { DocumentModel } from "document-model/document";
import { module as DocumentModelLib } from "document-model/document-model";
import dotenv from "dotenv";
import { drizzle } from "drizzle-orm/connect";
import express from "express";
import http from "http";
import {
  addSubgraph,
  createSchema,
  initReactorRouter,
  registerInternalListener,
  setAdditionalContextFields,
} from "@powerhousedao/reactor-api";
import * as searchListener from "@powerhousedao/general-document-indexer";
import { getSchema as getAuthSchema } from "./subgraphs/auth/subgraph";
import { getSchema as getAnalyticsSchema } from "./subgraphs/analytics/subgraph";
import path from "path";
import { GraphQLResolverMap } from "@apollo/subgraph/dist/schema-helper";
import {
  transmit as analyticsTransmit,
  options as analyticsOptions,
} from "./subgraphs/analytics/listener";
import { logger } from "document-drive/logger";
import get from "./subgraphs/analytics/service";
import { AnalyticsModel } from "@powerhousedao/analytics-engine-graphql";
import { AnalyticsQueryEngine } from "@powerhousedao/analytics-engine-core";

dotenv.config();

// start document drive server with all available document models
const driveServer = new DocumentDriveServer(
  [
    DocumentModelLib,
    ...Object.values(DocumentModelsLibs),
  ] as DocumentModel[],
  new FilesystemStorage(path.join(__dirname, "../file-storage")),
);

// Create a monolith express app for all subgraphs
const app = express();
const serverPort = process.env.PORT ? Number(process.env.PORT) : 4001;
const httpServer = http.createServer(app);
let db: any;
const main = async () => {
  try {
    // init db
    if (process.env.DATABASE_URL && process.env.DATABASE_URL !== "") {
      logger.info("Indexer processor using postgres database.");

      db = await drizzle("node-postgres", process.env.DATABASE_URL);
    } else {
      logger.info("Indexer processor using pglite database.");

      db = await drizzle("pglite", "./dev.db");
    }

    // init drive server
    await driveServer.initialize();

    // init router
    await initReactorRouter("/", app, driveServer);

    setAdditionalContextFields({ db });
    setAdditionalContextFields({
      dataSources: {
        db: {
          Analytics: new AnalyticsModel(new AnalyticsQueryEngine(get()))
        }
      }
    });

    // add search subgraph @todo: automatically add all subgraphs
    await addSubgraph({
      name: "search/:drive",
      getSchema: (driveServer) =>
        createSchema(
          driveServer,
          searchListener.resolvers as GraphQLResolverMap,
          searchListener.typeDefs
        ),
    });

    /*
    await registerInternalListener({
      ...searchListener,
      name: "general-document-indexer",
      transmit(strands) {
        return searchListener.transmit(strands, db);
      },
    });
    */

    // analytics listener
    await registerInternalListener({
      name: "analytics",
      options: analyticsOptions,
      transmit: analyticsTransmit,
    });

    // add auth subgraph
    await addSubgraph({
      name: "auth",
      getSchema: (driveServer) => getAuthSchema(driveServer),
    });

    await addSubgraph({
      name: "analytics",
      getSchema: (driveServer) => getAnalyticsSchema(driveServer),
    });

    // load switchboard-gui
    app.use(
      express.static(
        path.join(
          __dirname,
          "../node_modules/@powerhousedao/switchboard-gui/dist"
        )
      )
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
