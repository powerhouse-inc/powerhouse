import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import { ApolloServerPluginInlineTraceDisabled } from "@apollo/server/plugin/disabled";
import { BaseDocumentDriveServer } from "document-drive";
import { IRouter, Router } from "express";
import { SUBGRAPH_REGISTRY } from "./subgraphs";
import { Context } from "./types";

export let reactorRouter: IRouter = Router();

const getLocalSubgraphConfig = (subgraphName: string) =>
  SUBGRAPH_REGISTRY.find((it) => it.name === subgraphName);

export const updateRouter = async (driveServer: BaseDocumentDriveServer) => {
  const newRouter = Router();
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
          }),
      })
    );

    console.log(`Setting up [${subgraphConfig.name}] subgraph at /${path}`);
  }
  reactorRouter = newRouter;
  console.log("All subgraphs started.");
};

export const initReactorRouter = async (
  driveServer: BaseDocumentDriveServer
) => {
  const models = driveServer.getDocumentModels();
  const driveModel = models.find(
    (it) => it.documentModel.name === "DocumentDrive"
  );

  if (!driveModel) {
    throw new Error("DocumentDrive model required");
  }

  await updateRouter(driveServer);
  driveServer.on("documentModels", () => {
    updateRouter(driveServer);
  });

  return reactorRouter;
};
