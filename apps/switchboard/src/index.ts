#!/usr/bin/env node
import { startAPI } from "@powerhousedao/reactor-api";
import * as Sentry from "@sentry/node";
import {
  InMemoryCache,
  ReactorBuilder,
  driveDocumentModelModule,
} from "document-drive";
import RedisCache from "document-drive/cache/redis";
import { FilesystemStorage } from "document-drive/storage/filesystem";
import { PrismaStorageFactory } from "document-drive/storage/prisma";
import {
  type DocumentModelModule,
  documentModelDocumentModelModule,
} from "document-model";
import dotenv from "dotenv";
import express from "express";
import path from "path";
import { type RedisClientType } from "redis";
import { initRedis } from "./clients/redis.js";
import { initProfilerFromEnv } from "./profiler.js";

dotenv.config();

// Create a monolith express app for all subgraphs
const app = express();

if (process.env.SENTRY_DSN) {
  console.log("Initialized Sentry with env:", process.env.SENTRY_ENV);
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENV,
  });

  Sentry.setupExpressErrorHandler(app);
}

const serverPort = process.env.PORT ? Number(process.env.PORT) : 4001;

const main = async () => {
  if (process.env.PYROSCOPE_SERVER_ADDRESS) {
    try {
      await initProfilerFromEnv(process.env);
    } catch (e) {
      Sentry.captureException(e);
      console.error("Error starting profiler", e);
    }
  }

  try {
    const redisUrl = process.env.REDIS_TLS_URL ?? process.env.REDIS_URL;
    let redis: RedisClientType | undefined;
    if (redisUrl) {
      redis = await initRedis(redisUrl);
    }
    const connectionString = process.env.DATABASE_URL ?? "./.ph/drive-storage";
    const dbUrl =
      connectionString.includes("amazonaws") &&
      !connectionString.includes("sslmode=no-verify")
        ? connectionString + "?sslmode=no-verify"
        : connectionString;

    const cache = redis ? new RedisCache(redis) : new InMemoryCache();
    const storageFactory = dbUrl.startsWith("postgres")
      ? new PrismaStorageFactory(dbUrl, cache)
      : undefined;
    const storage = storageFactory
      ? storageFactory.build()
      : new FilesystemStorage(path.join(process.cwd(), dbUrl));

    const reactor = new ReactorBuilder([
      documentModelDocumentModelModule,
      driveDocumentModelModule,
    ] as DocumentModelModule[])
      .withStorage(storage)
      .withCache(cache)
      .build();

    // init drive server
    await reactor.initialize();

    // Start the API with the reactor and options
    await startAPI(reactor, {
      express: app,
      port: serverPort,
      dbPath: dbUrl.startsWith("postgres") ? dbUrl : "./.ph/read-storage",
      configFile: path.join(process.cwd(), "powerhouse.config.json"),
    });
  } catch (e) {
    Sentry.captureException(e);
    console.error("App crashed", e);
    throw e;
  }
};

main().catch(console.error);
