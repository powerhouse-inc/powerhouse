#!/usr/bin/env node
import {
  KnexAnalyticsStore,
  KnexQueryExecutor,
} from "@powerhousedao/analytics-engine-knex";
import {
  Subgraph,
  SubgraphManager,
  getDbClient,
} from "@powerhousedao/reactor-api";
import { PrismaClient } from "@prisma/client";
import * as atlasDocumentModelsMap from "@sky-ph/atlas/document-models";
import * as atlasSubgraphs from "@sky-ph/atlas/subgraphs";
import { ReactorBuilder, driveDocumentModelModule } from "document-drive";
import RedisCache from "document-drive/cache/redis";
import { PrismaStorage } from "document-drive/storage/prisma";
import {
  DocumentModelModule,
  documentModelDocumentModelModule,
} from "document-model";
import dotenv from "dotenv";
import express from "express";
import http from "http";
import { initRedis } from "./clients/redis.js";
dotenv.config();

const atlasDocumentModels = Object.values(atlasDocumentModelsMap);

// Create a monolith express app for all subgraphs
const app = express();
const serverPort = process.env.PORT ? Number(process.env.PORT) : 4001;
const httpServer = http.createServer(app);
const main = async () => {
  try {
    const redis = await initRedis();
    const prismaClient: PrismaClient = new PrismaClient();
    const connectionString = process.env.DATABASE_URL;
    const dbUrl =
      connectionString?.includes("amazonaws") &&
      !connectionString.includes("sslmode=no-verify")
        ? connectionString + "?sslmode=no-verify"
        : connectionString;
    const knex = getDbClient(dbUrl);
    const redisCache = new RedisCache(redis);
    const storage = new PrismaStorage(prismaClient);
    const driveServer = new ReactorBuilder([
      documentModelDocumentModelModule,
      driveDocumentModelModule,
      ...atlasDocumentModels,
    ] as DocumentModelModule[])
      .withStorage(storage)
      .withCache(redisCache)
      .build();

    // init drive server
    await driveServer.initialize();
    const analyticsStore = new KnexAnalyticsStore({
      executor: new KnexQueryExecutor(),
      knex,
    });
    const subgraphManager = new SubgraphManager(
      process.env.BASE_PATH || "/",
      app,
      driveServer,
      knex,
      // @ts-expect-error todo update analytics store to use IAnalyticsStore
      analyticsStore,
    );
    // init router
    await subgraphManager.init();

    for (const [name, module] of Object.entries(
      atlasSubgraphs as Record<string, Record<string, typeof Subgraph>>,
    )) {
      await subgraphManager.registerSubgraph(module[name]);
    }

    // // load switchboard-gui
    // app.use(
    //   express.static(
    //     path.join(
    //       __dirname,
    //       "../node_modules/@powerhousedao/switchboard-gui/dist",
    //     ),
    //   ),
    // );

    // start http server
    httpServer.listen({ port: serverPort }, () => {
      console.log(`Subgraph server listening on port ${serverPort}`);
    });
  } catch (e) {
    console.error("App crashed", e);
  }
};

main().catch(console.error);
