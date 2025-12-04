#!/usr/bin/env node
import {
  EventBus,
  ReactorBuilder,
  ReactorClientBuilder,
} from "@powerhousedao/reactor";
import {
  VitePackageLoader,
  getUniqueDocumentModels,
  initializeAndStartAPI,
  startViteServer,
} from "@powerhousedao/reactor-api";
import * as Sentry from "@sentry/node";
import type { ICache, IDocumentDriveServer } from "document-drive";
import {
  DocumentAlreadyExistsError,
  InMemoryCache,
  ReactorBuilder as LegacyReactorBuilder,
  RedisCache,
  childLogger,
  driveDocumentModelModule,
} from "document-drive";
import { FilesystemStorage } from "document-drive/storage/filesystem";
import { PrismaStorageFactory } from "document-drive/storage/prisma";
import type { DocumentModelModule } from "document-model";
import { documentModelDocumentModelModule } from "document-model";
import dotenv from "dotenv";
import express from "express";
import path from "path";
import type { RedisClientType } from "redis";
import { initRedis } from "./clients/redis.js";
import { initFeatureFlags } from "./feature-flags.js";
import { initProfilerFromEnv } from "./profiler.js";
import type { StartServerOptions, SwitchboardReactor } from "./types.js";
import { addDefaultDrive, addRemoteDrive, isPostgresUrl } from "./utils.js";

const logger = childLogger(["switchboard"]);

dotenv.config();

// Create a monolith express app for all subgraphs
const app = express();

if (process.env.SENTRY_DSN) {
  logger.info("Initialized Sentry with env:", process.env.SENTRY_ENV);
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENV,
  });

  Sentry.setupExpressErrorHandler(app);
}

const DEFAULT_PORT = process.env.PORT ? Number(process.env.PORT) : 4001;

async function initPrismaStorage(connectionString: string, cache: ICache) {
  try {
    const prismaFactory = new PrismaStorageFactory(connectionString, cache);
    await prismaFactory.checkConnection();
    return prismaFactory.build();
  } catch (e) {
    const prismaConnectError = "Can't reach database server at";
    if (e instanceof Error && e.message.includes(prismaConnectError)) {
      const dbUrl = connectionString;
      const safeUrl = `${dbUrl.slice(0, dbUrl.indexOf(":") + 1)}{...}${dbUrl.slice(dbUrl.indexOf("@"), dbUrl.lastIndexOf("?"))}`;
      logger.warn(`Can't reach database server at '${safeUrl}'`);
    } else {
      logger.error(e);
    }
    throw e;
  }
}

async function initReactorStorage(
  cache: ICache,
  dbPath: string = "./.ph/drive-storage",
) {
  const isPostgres = isPostgresUrl(dbPath);

  try {
    if (isPostgres) {
      const connectionString =
        dbPath.includes("amazonaws") && !dbPath.includes("sslmode=no-verify")
          ? dbPath + "?sslmode=no-verify"
          : dbPath;

      const storage = await initPrismaStorage(connectionString, cache);
      return { storage, storagePath: dbPath };
    }
  } catch {
    logger.warn("Falling back to filesystem storage");
  }

  // if url was postgres and connection failed, fallback to filesystem on default path
  const filesystemPath = isPostgres ? "./.ph/drive-storage" : dbPath;
  return {
    storage: new FilesystemStorage(path.join(process.cwd(), filesystemPath)),
    storagePath: filesystemPath,
  };
}

async function initServer(serverPort: number, options: StartServerOptions) {
  const { dev, packages = [], remoteDrives = [] } = options;

  const dbPath = options.dbPath ?? process.env.DATABASE_URL;

  // start redis if configured
  const redisUrl = process.env.REDIS_TLS_URL ?? process.env.REDIS_URL;
  let redis: RedisClientType | undefined;
  if (redisUrl) {
    try {
      redis = await initRedis(redisUrl);
    } catch (e) {
      logger.error(e);
    }
  }
  const cache = redis ? new RedisCache(redis) : new InMemoryCache();
  const { storage, storagePath } = await initReactorStorage(cache, dbPath);
  // if dbPath is not configured, or it was a postgres url but the connection failed,
  // use default path for read model storage
  const readModelPath =
    !dbPath || (isPostgresUrl(dbPath) && dbPath !== storagePath)
      ? ".ph/read-storage"
      : dbPath;

  const initializeDriveServer = async (
    documentModels: DocumentModelModule[],
  ) => {
    const driveServer = new LegacyReactorBuilder(
      getUniqueDocumentModels([
        documentModelDocumentModelModule,
        driveDocumentModelModule,
        ...documentModels,
      ] as unknown as DocumentModelModule[]),
    )
      .withStorage(storage)
      .withCache(cache)
      .withOptions({
        featureFlags: {
          enableDualActionCreate:
            options.reactorOptions?.enableDualActionCreate ?? false,
        },
      })
      .build();

    // init drive server
    await driveServer.initialize();
    return driveServer;
  };

  const initializeClient = async (
    driveServer: IDocumentDriveServer,
    documentModels: DocumentModelModule[],
  ) => {
    const eventBus = new EventBus();
    const builder = new ReactorBuilder()
      .withEventBus(eventBus)
      .withDocumentModels(
        getUniqueDocumentModels([
          documentModelDocumentModelModule,
          driveDocumentModelModule,
          ...documentModels,
        ] as unknown as DocumentModelModule[]),
      )
      .withLegacyStorage(storage)
      .withFeatures({
        legacyStorageEnabled: true,
      });

    const client = new ReactorClientBuilder()
      .withReactorBuilder(builder)
      .build();

    return client;
  };

  let defaultDriveUrl: undefined | string = undefined;

  // TODO get path from powerhouse config
  // start vite server if dev mode is enabled
  const basePath = process.cwd();
  const vite = dev ? await startViteServer(process.cwd()) : undefined;

  // get paths to local document models
  if (!options.disableLocalPackages) {
    packages.push(basePath);
  }

  // create loader
  const packageLoader = vite ? VitePackageLoader.build(vite) : undefined;

  // Start the API with the reactor and options
  const api = await initializeAndStartAPI(
    initializeDriveServer,
    initializeClient,
    {
      express: app,
      port: serverPort,
      dbPath: readModelPath,
      https: options.https,
      packageLoader,
      packages: packages,
      processorConfig: options.processorConfig,
      configFile:
        options.configFile ??
        path.join(process.cwd(), "powerhouse.config.json"),
      mcp: options.mcp ?? true,
    },
  );

  const { driveServer } = api;

  // Create default drive if provided
  if (options.drive) {
    defaultDriveUrl = await addDefaultDrive(
      driveServer,
      options.drive,
      serverPort,
    );
  }

  // add vite middleware after express app is initialized if applicable
  if (vite) {
    api.app.use(vite.middlewares);
  }

  // Connect to remote drives AFTER packages are loaded
  if (remoteDrives.length > 0) {
    for (const remoteDriveUrl of remoteDrives) {
      let driveId: string | undefined;

      try {
        const remoteDrive = await addRemoteDrive(driveServer, remoteDriveUrl);
        driveId = remoteDrive.header.id;
        logger.debug(`Remote drive ${remoteDriveUrl} synced`);
      } catch (error) {
        if (error instanceof DocumentAlreadyExistsError) {
          logger.debug(`Remote drive already added: ${remoteDriveUrl}`);
          driveId = remoteDriveUrl.split("/").pop();
        } else {
          logger.error(
            `Failed to connect to remote drive ${remoteDriveUrl}:`,
            error,
          );
        }
      } finally {
        // Construct local URL once in finally block
        if (!defaultDriveUrl && driveId) {
          const protocol = options.https ? "https" : "http";
          defaultDriveUrl = `${protocol}://localhost:${serverPort}/d/${driveId}`;
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

  // Initialize feature flags
  await initFeatureFlags();

  options.reactorOptions = {
    enableDualActionCreate: true,
  };

  if (process.env.PYROSCOPE_SERVER_ADDRESS) {
    try {
      await initProfilerFromEnv(process.env);
    } catch (e) {
      Sentry.captureException(e);
      logger.error("Error starting profiler", e);
    }
  }

  try {
    return await initServer(serverPort, options);
  } catch (e) {
    Sentry.captureException(e);
    logger.error("App crashed", e);
    throw e;
  }
};

export * from "./types.js";
