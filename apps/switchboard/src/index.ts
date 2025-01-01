import {
  KnexAnalyticsStore,
  KnexQueryExecutor,
} from "@powerhousedao/analytics-engine-knex";
import { SubgraphManager, getDbClient } from "@powerhousedao/reactor-api";
import { PrismaClient } from "@prisma/client";
import { DocumentDriveServer } from "document-drive";
import RedisCache from "document-drive/cache/redis";
import { PrismaStorage } from "document-drive/storage/prisma";
import * as DocumentModelsLibs from "document-model-libs/document-models";
import { DocumentModel } from "document-model/document";
import { module as DocumentModelLib } from "document-model/document-model";
import dotenv from "dotenv";
import express from "express";
import http from "http";
import path from "path";
import { initRedis } from "./clients/redis";
dotenv.config();

// start document drive server with all available document models

// Create a monolith express app for all subgraphs
const app = express({

});
const serverPort = process.env.PORT ? Number(process.env.PORT) : 4001;
const httpServer = http.createServer(app);
const main = async () => {
  try {
    const redis = await initRedis();
    // @ts-ignore: @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
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
    const driveServer = new DocumentDriveServer(
      [
        DocumentModelLib,
        ...Object.values(DocumentModelsLibs),
      ] as DocumentModel[],
      storage,
      redisCache,
    );

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
      analyticsStore,
    );
    // init router
    await subgraphManager.init();

    // load switchboard-gui
    app.use(
      express.static(
        path.join(
          __dirname,
          "../node_modules/@powerhousedao/switchboard-gui/dist",
        ),
      ),
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
