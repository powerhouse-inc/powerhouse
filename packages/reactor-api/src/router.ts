import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import { ApolloServerPluginInlineTraceDisabled } from "@apollo/server/plugin/disabled";
import bodyParser from "body-parser";
import cors from "cors";
import { IDocumentDriveServer } from "document-drive";
import express, { IRouter, Router } from "express";
import {
  InternalListenerManager,
  InternalListenerModule,
} from "./internal-listener-manager";
import { SUBGRAPH_REGISTRY } from "./subgraphs";
import { Context } from "./types";
export let reactorRouter: IRouter = Router();

const getLocalSubgraphConfig = (subgraphName: string) =>
  SUBGRAPH_REGISTRY.find((it) => it.name === subgraphName);

let listenerManager: InternalListenerManager | undefined;

export const getListenerManager = async (driveServer: IDocumentDriveServer) => {
  if (!listenerManager) {
    listenerManager = new InternalListenerManager(driveServer);
    await listenerManager.init();
  }
  return listenerManager;
};

export const updateRouter = async (driveServer: IDocumentDriveServer) => {
  const newRouter = Router();
  newRouter.use(cors());
  newRouter.use(bodyParser.json());
  // Run each subgraph on the same http server, but at different paths
  for (const subgraph of SUBGRAPH_REGISTRY) {
    const subgraphConfig = getLocalSubgraphConfig(subgraph.name);
    if (!subgraphConfig) continue;

    // get schema
    const schema = subgraphConfig.getSchema(driveServer);

    // create apollo server
    const server = new ApolloServer({
      schema,
      introspection: true,
      plugins: [ApolloServerPluginInlineTraceDisabled()],
    });

    // start apollo server
    await server.start();

    // setup path
    const path = `/${subgraphConfig.name}`;
    newRouter.use(
      path,
      expressMiddleware(server, {
        context: ({ req }): Promise<Context> =>
          Promise.resolve({
            headers: req.headers,
            driveId: req.params.drive ?? undefined,
            driveServer,
            ...getAdditionalContextFields(),
          }),
      }),
    );
    console.log(`Setting up [${subgraphConfig.name}] subgraph at ${path}`);
  }

  listenerManager = await getListenerManager(driveServer);
  reactorRouter = newRouter;
  console.log("All subgraphs started.");
};

let docDriveServer: IDocumentDriveServer;
export const initReactorRouter = async (
  path: string,
  app: express.Express,
  driveServer: IDocumentDriveServer,
) => {
  docDriveServer = driveServer;
  const models = driveServer.getDocumentModels();
  const driveModel = models.find(
    (it) => it.documentModel.name === "DocumentDrive",
  );

  if (!driveModel) {
    throw new Error("DocumentDrive model required");
  }

  await updateRouter(driveServer);
  driveServer.on("documentModels", () => {
    updateRouter(driveServer).catch((error: unknown) => console.error(error));
  });

  app.use(path, (req, res, next) => reactorRouter(req, res, next));
};

export const addSubgraph = async (
  subgraph: (typeof SUBGRAPH_REGISTRY)[number],
) => {
  SUBGRAPH_REGISTRY.unshift(subgraph);
  await updateRouter(docDriveServer);
};

export const registerInternalListener = async (
  module: InternalListenerModule,
) => {
  if (!listenerManager) {
    throw new Error("Listener manager not initialized");
  }
  await listenerManager.registerInternalListener(module);
};

let contextFields = {};
export const getAdditionalContextFields = () => {
  return contextFields;
};

export const setAdditionalContextFields = (fields: Record<string, any>) => {
  contextFields = { ...contextFields, ...fields };
};
