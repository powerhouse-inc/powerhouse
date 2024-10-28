import { GraphQLResolverMap } from "@apollo/subgraph/dist/schema-helper";
import {
  addSubgraph,
  createSchema,
  registerInternalListener,
  setAdditionalContextFields,
  startAPI,
} from "@powerhousedao/reactor-api";
import { DocumentDriveServer } from "document-drive";
import { FilesystemStorage } from "document-drive/storage/filesystem";
import * as DocumentModelsLibs from "document-model-libs/document-models";
import { DocumentModel } from "document-model/document";
import { module as DocumentModelLib } from "document-model/document-model";
import dotenv from "dotenv";
import { drizzle } from "drizzle-orm/connect";
import path from "path";
import * as searchListener from "@powerhousedao/general-document-indexer";
dotenv.config();

// start document drive server with all available document models & filesystem storage
const driveServer = new DocumentDriveServer(
  [DocumentModelLib, ...Object.values(DocumentModelsLibs)] as DocumentModel[],
  new FilesystemStorage(path.join(__dirname, "../file-storage")),
);

// Start GraphQL API
const serverPort = process.env.PORT ? Number(process.env.PORT) : 4001;

const startServer = async () => {
  const db = await drizzle("pglite", "./dev.db");

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
    // TODO check if error is because drive already exists
    console.info("Default drive already exists. Skipping...");
  }

  try {
    // start api
    await startAPI(driveServer, {
      port: serverPort,
    });

    setAdditionalContextFields({ db });

    // register general document indexer listener
    await registerInternalListener({
      name: "search",
      options: searchListener.options,
      transmit: (strands) => searchListener.transmit(strands, db),
    });

    // add general document indexer subgraph
    await addSubgraph({
      getSchema: () =>
        createSchema(
          driveServer,
          searchListener.resolvers as GraphQLResolverMap,
          searchListener.typeDefs,
        ),
      name: "search/:drive",
    });
  } catch (e) {
    console.error("App crashed", e);
  }
};

export { startServer };
