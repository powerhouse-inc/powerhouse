#!/usr/bin/env node
import { startAPI } from "@powerhousedao/reactor-api";
import * as Sentry from "@sentry/node";
import {
  InMemoryCache,
  ReactorBuilder,
  driveDocumentModelModule,
} from "document-drive";
import RedisCache from "document-drive/cache/redis";
import { PrismaStorageFactory } from "document-drive/storage/prisma";
import {
  type DocumentModelModule,
  documentModelDocumentModelModule,
} from "document-model";
import dotenv from "dotenv";
import express from "express";
import { initRedis } from "./clients/redis.js";
import { initProfilerFromEnv } from "./profiler.js";
import { PackagesManager } from "./utils/package-manager.js";

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
    const packages =
      process.env.PH_PACKAGES && process.env.PH_PACKAGES !== ""
        ? process.env.PH_PACKAGES.split(",")
        : [];
    const pkgManager = new PackagesManager({
      packages,
    });
    const { documentModels, subgraphs } = await pkgManager.init();
    const redis = await initRedis();
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("Please set env var DATABASE_URL");
    }
    const dbUrl =
      connectionString.includes("amazonaws") &&
      !connectionString.includes("sslmode=no-verify")
        ? connectionString + "?sslmode=no-verify"
        : connectionString;

    const cache = redis ? new RedisCache(redis) : new InMemoryCache();
    const storageFactory = new PrismaStorageFactory(dbUrl, cache);
    const storage = storageFactory.build();

    const reactor = new ReactorBuilder([
      documentModelDocumentModelModule,
      driveDocumentModelModule,
      ...documentModels,
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
      dbPath: dbUrl,
      packages,
    });
  } catch (e) {
    Sentry.captureException(e);
    console.error("App crashed", e);
    throw e;
  }
};

main().catch(console.error);
