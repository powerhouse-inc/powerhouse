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
import { type StartServerOptions, type SwitchboardReactor } from "./types.js";
import { addDefaultDrive } from "./utils.js";

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

const DEFAULT_PORT = process.env.PORT ? Number(process.env.PORT) : 4001;

export const startSwitchboard = async (
  options: StartServerOptions = {},
): Promise<SwitchboardReactor> => {
  const serverPort = options.port ?? DEFAULT_PORT;

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
      try {
        redis = await initRedis(redisUrl);
      } catch (e) {
        console.error(e);
      }
    }
    const connectionString = process.env.DATABASE_URL ?? "./.ph/drive-storage";
    const dbUrl =
      connectionString.includes("amazonaws") &&
      !connectionString.includes("sslmode=no-verify")
        ? connectionString + "?sslmode=no-verify"
        : connectionString;

    const cache = redis ? new RedisCache(redis) : new InMemoryCache();
    const storageFactory = dbUrl.startsWith("postgresql")
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

    const dbPath = dbUrl.startsWith("postgresql") ? dbUrl : ".ph/read-storage";

    let defaultDriveUrl: undefined | string = undefined;

    if (options.drive) {
      defaultDriveUrl = await addDefaultDrive(
        reactor,
        options.drive,
        serverPort,
      );
    }

    // Start the API with the reactor and options
    await startAPI(reactor, {
      express: app,
      port: serverPort,
      dbPath: options.dbPath ?? dbPath,
      https: options.https,
      packages: options.packages,
      configFile:
        options.configFile ??
        path.join(process.cwd(), "powerhouse.config.json"),
      auth: options.auth,
    });

    return {
      defaultDriveUrl,
      reactor,
    };
  } catch (e) {
    Sentry.captureException(e);
    console.error("App crashed", e);
    throw e;
  }
};

export * from "./types.js";
