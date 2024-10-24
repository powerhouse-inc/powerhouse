import { DocumentDriveServer } from "document-drive";
import { FilesystemStorage } from "document-drive/storage/filesystem";
import * as DocumentModelsLibs from "document-model-libs/document-models";
import { DocumentModel } from "document-model/document";
import { module as DocumentModelLib } from "document-model/document-model";
import dotenv from "dotenv";
import { drizzle } from "drizzle-orm/connect";
import path from "path";
import {
  addSubgraph,
  createSchema,
  startAPI,
} from "@powerhousedao/reactor-api";
import { InternalListenerManager } from "./utils/internal-listener-manager";
import * as searchSubgraph from "@powerhousedao/general-document-indexer";
import { GraphQLResolverMap } from "@apollo/subgraph/dist/schema-helper";
dotenv.config();

// start document drive server with all available document models
const driveServer = new DocumentDriveServer(
  [DocumentModelLib, ...Object.values(DocumentModelsLibs)] as DocumentModel[],
  new FilesystemStorage(path.join(__dirname, "../file-storage"))
);

// Create a monolith express app for all subgraphs
const serverPort = process.env.PORT ? Number(process.env.PORT) : 4001;
let db: any;
const main = async () => {
  db = await drizzle("pglite", "./dev.db");

  // init drive server
  await driveServer.initialize();
  try {
    // add default drive
    await driveServer.addDrive({
      global: {
        id: "powerhouse",
        name: "Powerhouse",
        icon: "powerhouse",
        slug: "powerhouse",
      },
      local: {
        availableOffline: true,
        listeners: [],
        sharingType: "public",
        triggers: [],
      },
    });
  } catch (e) {
    console.info("Default drive already exists", e);
  }

  // init listener manager
  const listenerManager = new InternalListenerManager(driveServer);
  await listenerManager.init();

  try {
    // start api
    await startAPI(driveServer, {
      port: serverPort,
    });

    // add search subgraph @todo: automatically add all subgraphs
    await addSubgraph({
      name: "search/:drive",
      getSchema: (driveServer) =>
        createSchema(
          driveServer,
          searchSubgraph.resolvers as GraphQLResolverMap,
          searchSubgraph.typeDefs
        ),
    });
  } catch (e) {
    console.error("App crashed", e);
  }
};

export function getDb() {
  return db;
}

main();
