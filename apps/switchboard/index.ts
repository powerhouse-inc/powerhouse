import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginInlineTraceDisabled } from '@apollo/server/plugin/disabled';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import bodyParser from 'body-parser';
import cors from 'cors';
import { DocumentDriveServer } from 'document-drive';
import * as DocumentModelsLibs from 'document-model-libs/document-models';
import { DocumentModel } from 'document-model/document';
import { module as DocumentModelLib } from 'document-model/document-model';
import { drizzle } from 'drizzle-orm/connect';
import express from 'express';
import http from 'http';
import { getSchema as getAuthSchema } from './subgraphs/auth/subgraph';
import { getSchema as getDriveSchema } from './subgraphs/drive/subgraph';
import { getSchema as getRwaReadModelSchema } from './subgraphs/rwa-read-model/subgraph';
import { getSchema as getSystemSchema } from './subgraphs/system/subgraph';
import { InternalListenerManager } from './utils/internal-listener-manager';

import dotenv from 'dotenv';
import { DrizzleD1Database } from 'drizzle-orm/d1';
import { Context } from './types';

dotenv.config();

export const SUBGRAPH_REGISTRY = [
    {
        name: 'system',
        getSchema: getSystemSchema,
    },
    {
        name: 'auth',
        getSchema: getAuthSchema,
    },
    {
        name: ':drive/rwa-read-model',
        getSchema: getRwaReadModelSchema,
    },
    {
        name: ':drive',
        getSchema: getDriveSchema,
    },
];

// start document drive server with all available document models
const driveServer = new DocumentDriveServer([
    DocumentModelLib,
    ...Object.values(DocumentModelsLibs),
] as DocumentModel[]);

const getLocalSubgraphConfig = (subgraphName: string) =>
    SUBGRAPH_REGISTRY.find(it => it.name === subgraphName);

// Create a monolith express app for all subgraphs
let router: express.Router;
const app = express();
const serverPort = process.env.PORT ? Number(process.env.PORT) : 4001;
const httpServer = http.createServer(app);

// @TODO: app.use frontend on /

// @TODO: make this more specific
let db: Omit<DrizzleD1Database, 'batch' | 'values' | 'run' | 'all' | 'get'>;

export const updateRouter = async () => {
    const newRouter = express.Router();
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
            plugins: [
                ApolloServerPluginDrainHttpServer({ httpServer }),
                ApolloServerPluginInlineTraceDisabled(),
            ],
        });

        // start apollo server
        await server.start();

        // setup path
        const path = `/${subgraphConfig.name}`;
        newRouter.use(
            path,
            cors(),
            bodyParser.json(),
            expressMiddleware(server, {
                context: ({ req }): Promise<Context> =>
                    Promise.resolve({
                        headers: req.headers,
                        driveId: req.params.drive ?? undefined,
                        driveServer,
                        db,
                    }),
            }),
        );

        console.log(
            `Setting up [${subgraphConfig.name}] subgraph at http://localhost:${serverPort}${path}`,
        );
    }
    router = newRouter;
    console.log('All subgraphs started.');
};

const main = async () => {
    try {
        // init db
        if (process.env.DATABASE_URL && process.env.DATABASE_URL !== '') {
            // @ts-expect-error: linter doesnt see that drizzle returns a promise
            db = await drizzle('node-postgres', process.env.DATABASE_URL);
        } else {
            // @ts-expect-error: linter doesnt see that drizzle returns a promise
            db = await drizzle('pglite');
        }

        // init drive server
        await driveServer.initialize();

        // init listener manager
        const listenerManager = new InternalListenerManager(driveServer);
        await listenerManager.init();

        // init router
        await updateRouter();

        app.use('/graphql', router);

        // start http server
        httpServer.listen({ port: serverPort }, () => {
            console.log(`Subgraph server listening on port ${serverPort}`);
        });

        // update router with new document models on document models change
        driveServer.on('documentModels', async () => {
            await updateRouter();
        });
    } catch (e) {
        console.error('App crashed', e);
    }
};

main().catch(console.error);
