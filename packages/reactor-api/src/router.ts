import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import { ApolloServerPluginInlineTraceDisabled } from "@apollo/server/plugin/disabled";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import { BaseDocumentDriveServer } from "document-drive";
import { IRouter, Router } from "express";
import { SUBGRAPH_REGISTRY } from "./subgraphs";
import { Context } from "./types";

export let router: IRouter = Router();

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

    console.log(
      `Setting up [${subgraphConfig.name}] subgraph at /graphql${path}`
    );
  }
  router = newRouter;
  console.log("All subgraphs started.");
};
