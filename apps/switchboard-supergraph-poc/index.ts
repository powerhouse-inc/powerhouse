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

import { getSchema as getDriveSchema, getSchema } from './subgraphs/drive/subgraph';
import { getSchema as getSystemSchema } from './subgraphs/drive-server/subgraph';
// import { getSchema as getRwaReadModelSchema } from './subgraphs/rwa-read-model/subgraph'
import { getSchema as getAuthSchema } from './subgraphs/auth/subgraph';

export const SUBGRAPH_REGISTRY = [
    {
        name: 'system',
        getSchema: getSystemSchema
    },
    {
        name: 'drive',
        getSchema: getDriveSchema
    },
    {
        name: 'auth',
        getSchema: getAuthSchema
    }
];

// start document drive server with all available document models
const driveServer = new DocumentDriveServer([
    DocumentModelLib,
    ...Object.values(DocumentModelsLibs)
] as DocumentModel[]);

// regex to replace all input {\n ... \n} with empty string

const getLocalSubgraphConfig = (subgraphName: string) =>
    SUBGRAPH_REGISTRY.find(it => it.name === subgraphName);

export const startSubgraphs = async (httpPort: Number) => {
    // Create a monolith express app for all subgraphs
    const app = express();
    const httpServer = http.createServer(app);
    const serverPort = process.env.PORT ?? httpPort;

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
        app.use(
            path,
            cors(),
            bodyParser.json(),
            expressMiddleware(server, {
                context: async ({ req }) => ({ headers: req.headers, driveId: req.params.drive ?? undefined, driveServer })
            })
        );

        console.log(`Setting up [${subgraphConfig.name}] subgraph at http://localhost:${serverPort}${path}`);
    }

    // Start entire monolith at given port
    await new Promise((resolve) => httpServer.listen({ port: serverPort }, () => resolve(true)));

    console.log('All subgraphs started.')
};

(async () => {
    // init drive server
    await driveServer.initialize();

    // start subgraphs
    // let port = process.env.NODE_ENV === 'dev' ? undefined : 4001;
    await startSubgraphs(4001);

    // generate supergraph.yml
})();