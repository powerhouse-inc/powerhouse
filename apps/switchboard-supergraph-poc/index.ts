import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginInlineTraceDisabled } from '@apollo/server/plugin/disabled';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import bodyParser from 'body-parser';
import cors from 'cors';
import { DocumentDriveServer } from 'document-drive';
import * as DocumentModelsLibs from 'document-model-libs/document-models';
import { DocumentModel } from "document-model/document";
import { module as DocumentModelLib } from 'document-model/document-model';
import express from 'express';
import http from 'http';
import { getSchema as getDriveSchema } from './subgraphs/drive/subgraph';
import { getSchema as getSystemSchema } from './subgraphs/system/subgraph';

export const SUBGRAPH_REGISTRY = [
    {
        name: 'system',
        getSchema: getSystemSchema
    },
    {
        name: ':drive',
        getSchema: getDriveSchema
    },
    // {
    //     name: 'auth',
    //     getSchema: getAuthSchema
    // }
];

// start document drive server with all available document models
const driveServer = new DocumentDriveServer([
    DocumentModelLib,
    ...Object.values(DocumentModelsLibs)
] as DocumentModel[]);

const getLocalSubgraphConfig = (subgraphName: string) =>
    SUBGRAPH_REGISTRY.find(it => it.name === subgraphName);

// Create a monolith express app for all subgraphs
// @ts-ignore
let router: express.Router;
const app = express();
const serverPort = process.env.PORT ? Number(process.env.PORT) : 4001;
const httpServer = http.createServer(app);

export const updateRouter = async () => {
    const newRouter = express.Router();
    // Run each subgraph on the same http server, but at different paths
    for (const subgraph of SUBGRAPH_REGISTRY) {
        const subgraphConfig = getLocalSubgraphConfig(subgraph.name);
        if (!subgraphConfig) continue;
        const schema = subgraphConfig.getSchema(driveServer);
        const server = new ApolloServer({
            schema,
            introspection: true,
            plugins: [ApolloServerPluginDrainHttpServer({ httpServer }), ApolloServerPluginInlineTraceDisabled()]
        });

        await server.start();

        const path = `/${subgraphConfig.name}/graphql`;
        newRouter.use(
            path,
            cors(),
            bodyParser.json(),
            expressMiddleware(server, {
                context: async ({ req }) => ({ headers: req.headers, driveId: req.params.drive ?? undefined, driveServer })
            })
        );

        console.log(`Setting up [${subgraphConfig.name}] subgraph at http://localhost:${serverPort}${path}`);
    }
    router = newRouter;
    console.log('All subgraphs started.')
};


httpServer.listen({ port: serverPort }, () => {
    console.log(`Subgraph server listening on port ${serverPort}`);
});

(async () => {
    // init drive server
    await driveServer.initialize();
    await updateRouter();
    app.use(router);

    driveServer.on("documentModels", async (documentModels) => {
        await updateRouter();
    });
})();