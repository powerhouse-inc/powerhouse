#!/usr/bin/env node
import { register } from "node:module";
import { httpsHooksPath } from "@powerhousedao/reactor-api";

// Register HTTP/HTTPS module loader hooks for dynamic package imports
register(httpsHooksPath, import.meta.url);

import { PGlite } from "@electric-sql/pglite";
import {
  ChannelScheme,
  EventBus,
  ReactorBuilder,
  ReactorClientBuilder,
  driveCollectionId,
  parseDriveUrl,
  type Database,
} from "@powerhousedao/reactor";
import {
  HttpPackageLoader,
  VitePackageLoader,
  getUniqueDocumentModels,
  initializeAndStartAPI,
  startViteServer,
} from "@powerhousedao/reactor-api";
import { type IRenown } from "@renown/sdk";
import * as Sentry from "@sentry/node";
import type { ICache, IDocumentDriveServer } from "document-drive";
import {
  DocumentAlreadyExistsError,
  InMemoryCache,
  ReactorBuilder as LegacyReactorBuilder,
  childLogger,
  driveDocumentModelModule,
} from "document-drive";
import { RedisCache } from "document-drive/cache/redis";
import { FilesystemStorage } from "document-drive/storage/filesystem";
import { PrismaStorageFactory } from "document-drive/storage/prisma";
import type { DocumentModelModule } from "document-model";
import { documentModelDocumentModelModule } from "document-model";
import dotenv from "dotenv";
import express from "express";
import { Kysely, PostgresDialect } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import path from "path";
import { Pool } from "pg";
import type { RedisClientType } from "redis";
import { initRedis } from "./clients/redis.js";
import { initFeatureFlags } from "./feature-flags.js";
import { initProfilerFromEnv } from "./profiler.js";
import { initRenown } from "./renown.js";
import type { StartServerOptions, SwitchboardReactor } from "./types.js";
import { addDefaultDrive, addRemoteDrive, isPostgresUrl } from "./utils.js";

const logger = childLogger(["switchboard"]);

dotenv.config();

// Feature flag constants
const DOCUMENT_MODEL_SUBGRAPHS_ENABLED = "DOCUMENT_MODEL_SUBGRAPHS_ENABLED";
const DOCUMENT_MODEL_SUBGRAPHS_ENABLED_DEFAULT = true;

const REACTOR_STORAGE_V2 = "REACTOR_STORAGE_V2";
const REACTOR_STORAGE_V2_DEFAULT = true;

const ENABLE_DUAL_ACTION_CREATE = "ENABLE_DUAL_ACTION_CREATE";
const ENABLE_DUAL_ACTION_CREATE_DEFAULT = true;

const USE_NEW_DOCUMENT_MODEL_SUBGRAPH = "USE_NEW_DOCUMENT_MODEL_SUBGRAPH";
const USE_NEW_DOCUMENT_MODEL_SUBGRAPH_DEFAULT = true;

// Create a monolith express app for all subgraphs
const app = express();

if (process.env.SENTRY_DSN) {
  logger.info("Initialized Sentry with env: @env", process.env.SENTRY_ENV);
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
      logger.warn("Can't reach database server at '@safeUrl'", safeUrl);
    } else {
      logger.error("@error", e);
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

async function initServer(
  serverPort: number,
  options: StartServerOptions,
  renown: IRenown | null,
) {
  const { dev, packages = [], remoteDrives = [] } = options;

  const dbPath = options.dbPath ?? process.env.DATABASE_URL;

  // start redis if configured
  const redisUrl = process.env.REDIS_TLS_URL ?? process.env.REDIS_URL;
  let redis: RedisClientType | undefined;
  if (redisUrl) {
    try {
      redis = await initRedis(redisUrl);
    } catch (e) {
      logger.error("@error", e);
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

  // Load document models from HTTP registry if configured
  let httpDocumentModels: DocumentModelModule[] = [];
  const registryUrl = process.env.PH_REGISTRY_URL;
  const registryPackages = process.env.PH_REGISTRY_PACKAGES;

  // Create httpLoader in outer scope for use in initializeClient (dynamic loading)
  let httpLoader: HttpPackageLoader | undefined;
  if (registryUrl) {
    httpLoader = new HttpPackageLoader({ registryUrl });
  }

  if (registryUrl && registryPackages) {
    const packageNames = registryPackages.split(",").filter(Boolean);
    if (packageNames.length > 0 && httpLoader) {
      logger.info(
        "Loading packages from HTTP registry: @packages",
        packageNames,
      );
      httpDocumentModels = await httpLoader.loadPackages(packageNames, {
        info: (msg) => logger.info(msg),
        error: (msg, err) => logger.error("@msg: @err", msg, err),
      });
      logger.info(
        "Loaded @count document models from HTTP registry",
        httpDocumentModels.length,
      );
      // Log the loaded document model IDs for debugging
      for (const model of httpDocumentModels) {
        logger.info(
          "  - Loaded document model: @id (@name)",
          model.documentModel.global.id,
          model.documentModel.global.name,
        );
      }
    }
  }

  const initializeDriveServer = async (
    documentModels: DocumentModelModule[],
  ) => {
    const driveServer = new LegacyReactorBuilder(
      getUniqueDocumentModels([
        documentModelDocumentModelModule,
        driveDocumentModelModule,
        ...documentModels,
        ...httpDocumentModels,
      ]),
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
          ...httpDocumentModels,
        ]),
      )
      .withLegacyStorage(storage)
      .withChannelScheme(ChannelScheme.SWITCHBOARD)
      .withSignalHandlers();

    // Enable dynamic document model loading from HTTP registry
    if (httpLoader) {
      builder.withDocumentModelLoader(httpLoader);
    }

    const reactorDbUrl = process.env.PH_REACTOR_DATABASE_URL;
    if (reactorDbUrl && isPostgresUrl(reactorDbUrl)) {
      const connectionString = reactorDbUrl.includes("?")
        ? reactorDbUrl
        : `${reactorDbUrl}?sslmode=disable`;
      const pool = new Pool({ connectionString });
      const kysely = new Kysely<Database>({
        dialect: new PostgresDialect({ pool }),
      });
      builder.withKysely(kysely);
      logger.info("Using PostgreSQL for reactor storage");
    } else {
      const pglitePath = "./.ph/reactor-storage";
      const pglite = new PGlite(pglitePath);
      const kysely = new Kysely<Database>({
        dialect: new PGliteDialect(pglite),
      });
      builder.withKysely(kysely);
      logger.info("Using PGlite for reactor storage");
    }

    const clientBuilder = new ReactorClientBuilder().withReactorBuilder(
      builder,
    );

    if (renown) {
      clientBuilder.withSigner(renown.signer);
    }

    const module = await clientBuilder.buildModule();

    // Return the full ReactorClientModule
    return module;
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

  // storageV2=true means use new reactor (NOT legacy)
  const legacyReactor = !options.reactorOptions?.storageV2;

  // create loader with legacyReactor option
  const packageLoader = vite
    ? VitePackageLoader.build(vite, { legacyReactor })
    : undefined;
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
      enableDocumentModelSubgraphs: options.enableDocumentModelSubgraphs,
      useNewDocumentModelSubgraph: options.useNewDocumentModelSubgraph,
      legacyReactor,
    },
    "switchboard",
  );

  const { client, driveServer } = api;

  // Create default drive if provided
  if (options.drive) {
    if (!renown) {
      throw new Error("Cannot create default drive without Renown identity");
    }

    defaultDriveUrl = await addDefaultDrive(
      driveServer,
      client,
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
        if (legacyReactor) {
          // Use legacy reactor's addRemoteDrive
          const remoteDrive = await addRemoteDrive(driveServer, remoteDriveUrl);
          driveId = remoteDrive.header.id;
        } else {
          // Use new reactor's sync manager
          const { syncManager } = api;
          const parsed = parseDriveUrl(remoteDriveUrl);
          driveId = parsed.driveId;
          const remoteName = `remote-drive-${driveId}-${crypto.randomUUID()}`;
          await syncManager.add(
            remoteName,
            driveCollectionId("main", driveId),
            {
              type: "gql",
              parameters: { url: parsed.graphqlEndpoint },
            },
          );
        }
        logger.debug("Remote drive @remoteDriveUrl synced", remoteDriveUrl);
      } catch (error) {
        if (error instanceof DocumentAlreadyExistsError) {
          logger.debug(
            "Remote drive already added: @remoteDriveUrl",
            remoteDriveUrl,
          );
          driveId = remoteDriveUrl.split("/").pop();
        } else {
          logger.error(
            "Failed to connect to remote drive @remoteDriveUrl: @error",
            remoteDriveUrl,
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
    renown,
  };
}

export const startSwitchboard = async (
  options: StartServerOptions = {},
): Promise<SwitchboardReactor> => {
  const serverPort = options.port ?? DEFAULT_PORT;

  // Initialize feature flags
  const featureFlags = await initFeatureFlags();

  const enableDocumentModelSubgraphs = await featureFlags.getBooleanValue(
    DOCUMENT_MODEL_SUBGRAPHS_ENABLED,
    options.enableDocumentModelSubgraphs ??
      DOCUMENT_MODEL_SUBGRAPHS_ENABLED_DEFAULT,
  );

  options.enableDocumentModelSubgraphs = enableDocumentModelSubgraphs;

  const storageV2 = await featureFlags.getBooleanValue(
    REACTOR_STORAGE_V2,
    options.reactorOptions?.storageV2 ?? REACTOR_STORAGE_V2_DEFAULT,
  );

  const enableDualActionCreate = await featureFlags.getBooleanValue(
    ENABLE_DUAL_ACTION_CREATE,
    options.reactorOptions?.enableDualActionCreate ??
      ENABLE_DUAL_ACTION_CREATE_DEFAULT,
  );

  const useNewDocumentModelSubgraph = await featureFlags.getBooleanValue(
    USE_NEW_DOCUMENT_MODEL_SUBGRAPH,
    options.useNewDocumentModelSubgraph ??
      USE_NEW_DOCUMENT_MODEL_SUBGRAPH_DEFAULT,
  );

  options.useNewDocumentModelSubgraph = useNewDocumentModelSubgraph;

  options.reactorOptions = {
    enableDualActionCreate,
    storageV2,
  };

  logger.info("Feature flags: @flags", {
    DOCUMENT_MODEL_SUBGRAPHS_ENABLED: enableDocumentModelSubgraphs,
    REACTOR_STORAGE_V2: storageV2,
    ENABLE_DUAL_ACTION_CREATE: enableDualActionCreate,
    USE_NEW_DOCUMENT_MODEL_SUBGRAPH: useNewDocumentModelSubgraph,
  });

  if (process.env.PYROSCOPE_SERVER_ADDRESS) {
    try {
      await initProfilerFromEnv(process.env);
    } catch (e) {
      Sentry.captureException(e);
      logger.error("Error starting profiler: @error", e);
    }
  }

  // Initialize Renown if identity options are provided or keypair exists
  let renown: IRenown | null = null;
  try {
    renown = await initRenown(options.identity);
  } catch (e) {
    logger.warn("Failed to initialize ConnectCrypto: @error", e);
    if (options.identity?.requireExisting) {
      throw new Error(
        'Identity required but failed to initialize. Run "ph login" first.',
      );
    }
  }

  try {
    return await initServer(serverPort, options, renown);
  } catch (e) {
    Sentry.captureException(e);
    logger.error("App crashed: @error", e);
    throw e;
  }
};

export * from "./types.js";

if (import.meta.main) {
  await startSwitchboard();
}
