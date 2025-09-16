#!/usr/bin/env node
import {
  EventBus,
  InMemoryQueue,
  Reactor,
  ReactorClientBuilder,
} from "@powerhousedao/reactor";
import {
  VitePackageLoader,
  startAPI,
  startViteServer,
} from "@powerhousedao/reactor-api";
import * as Sentry from "@sentry/node";
import type { BaseDocumentDriveServer } from "document-drive";
import {
  DocumentAlreadyExistsError,
  InMemoryCache,
  ReactorBuilder,
  RedisCache,
  driveDocumentModelModule,
} from "document-drive";
import { FilesystemStorage } from "document-drive/storage/filesystem";
import { PrismaStorageFactory } from "document-drive/storage/prisma";
import type { IDocumentStorage } from "document-drive";
import type { DocumentModelModule } from "document-model";
import { documentModelDocumentModelModule } from "document-model";
import dotenv from "dotenv";
import express from "express";
import path from "path";
import type { RedisClientType } from "redis";
import { initRedis } from "./clients/redis.js";
import { initProfilerFromEnv } from "./profiler.js";
import type { StartServerOptions, SwitchboardReactor } from "./types.js";
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

async function initServer(serverPort: number, options: StartServerOptions) {
  const { dev, packages = [], remoteDrives = [] } = options;

  // start redis if configured
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

  const driveServer = new ReactorBuilder([
    documentModelDocumentModelModule,
    driveDocumentModelModule,
  ] as unknown as DocumentModelModule[])
    .withStorage(storage)
    .withCache(cache)
    .build();

  // init drive server
  await driveServer.initialize();

  const queue = new InMemoryQueue(new EventBus());
  const reactor = new Reactor(
    driveServer as unknown as BaseDocumentDriveServer,
    storage as unknown as IDocumentStorage,
    queue,
  );
  const client = new ReactorClientBuilder().withReactor(reactor).build();

  const dbPath = dbUrl.startsWith("postgresql") ? dbUrl : ".ph/read-storage";

  let defaultDriveUrl: undefined | string = undefined;

  // Create default drive if provided
  if (options.drive) {
    defaultDriveUrl = await addDefaultDrive(
      driveServer,
      options.drive,
      serverPort,
    );
  }

  // start vite server if dev mode is enabled
  const vite = dev ? await startViteServer() : undefined;

  // get paths to local document models
  if (dev) {
    // TODO get path from powerhouse config
    const basePath = process.cwd();
    packages.push(basePath);
  }

  // create loader
  const packageLoader = vite ? await VitePackageLoader.build(vite) : undefined;

  // Start the API with the reactor and options
  const api = await startAPI(driveServer, client, {
    express: app,
    port: serverPort,
    dbPath: options.dbPath ?? dbPath,
    https: options.https,
    packageLoader,
    packages: packages,
    configFile:
      options.configFile ?? path.join(process.cwd(), "powerhouse.config.json"),
    mcp: options.mcp ?? true,
  });

  // add vite middleware after express app is initialized if applicable
  if (vite) {
    api.app.use(vite.middlewares);
  }

  // Connect to remote drives AFTER packages are loaded
  if (remoteDrives.length > 0) {
    for (const remoteDriveUrl of remoteDrives) {
      try {
        await driveServer.addRemoteDrive(remoteDriveUrl, {
          availableOffline: true,
          sharingType: "public",
          listeners: [],
          triggers: [],
        });
        // Use the first remote drive URL as the default
        if (!defaultDriveUrl) {
          defaultDriveUrl = remoteDriveUrl;
        }
      } catch (error) {
        if (error instanceof DocumentAlreadyExistsError) {
          console.info(`Remote drive already added: ${remoteDriveUrl}`);
          // Still use this drive URL as default if not already set
          if (!defaultDriveUrl) {
            defaultDriveUrl = remoteDriveUrl;
          }
        } else {
          console.error(
            `Failed to connect to remote drive ${remoteDriveUrl}:`,
            error,
          );
        }
      }
    }
  }

  return {
    defaultDriveUrl,
    api,
    reactor: driveServer,
  };
}

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
    return await initServer(serverPort, options);
  } catch (e) {
    Sentry.captureException(e);
    console.error("App crashed", e);
    throw e;
  }
};

export * from "./types.js";
