#!/usr/bin/env node
import { httpsHooksPath } from "@powerhousedao/reactor-api";
import { register } from "node:module";

// Register HTTP/HTTPS module loader hooks for dynamic package imports
register(httpsHooksPath, import.meta.url);

import { PGlite } from "@electric-sql/pglite";
import { metrics } from "@opentelemetry/api";
import { getConfig } from "@powerhousedao/config/node";
import { ReactorInstrumentation } from "@powerhousedao/opentelemetry-instrumentation-reactor";
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
  PackageManagementService,
  PackagesSubgraph,
  VitePackageLoader,
  createViteLogger,
  getUniqueDocumentModels,
  initializeAndStartAPI,
  startViteServer,
} from "@powerhousedao/reactor-api";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { documentModels as vetraDocumentModels } from "@powerhousedao/vetra";
import { processorFactory as vetraProcessorFactory } from "@powerhousedao/vetra/processors";
import { type IRenown } from "@renown/sdk";
import * as Sentry from "@sentry/node";
import { childLogger, documentModelDocumentModelModule } from "document-model";
import dotenv from "dotenv";
import express from "express";
import { Kysely, PostgresDialect } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import path from "path";
import { Pool } from "pg";
import type { RedisClientType } from "redis";
import { initRedis } from "./clients/redis.js";
import { initFeatureFlags } from "./feature-flags.js";
import { initRenown } from "./renown.js";
import type { StartServerOptions, SwitchboardReactor } from "./types.js";
import { addDefaultDrive, isPostgresUrl } from "./utils.js";

const defaultLogger = childLogger(["switchboard"]);

dotenv.config();

// Feature flag constants
const DOCUMENT_MODEL_SUBGRAPHS_ENABLED = "DOCUMENT_MODEL_SUBGRAPHS_ENABLED";
const DOCUMENT_MODEL_SUBGRAPHS_ENABLED_DEFAULT = true;

// Create a monolith express app for all subgraphs
const app = express();

if (process.env.SENTRY_DSN) {
  defaultLogger.info(
    "Initialized Sentry with env: @env",
    process.env.SENTRY_ENV,
  );
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENV,
  });

  Sentry.setupExpressErrorHandler(app);
}

const DEFAULT_PORT = process.env.PORT ? Number(process.env.PORT) : 4001;

async function initServer(
  serverPort: number,
  options: StartServerOptions,
  renown: IRenown | null,
) {
  // Register the global MeterProvider before ReactorInstrumentation is
  // constructed. setGlobalMeterProvider is a one-way door — once set it cannot
  // be unset — so this must happen before initializeClient calls
  // instrumentation.start() → createMetrics() → metrics.getMeter().
  if (options.meterProvider) {
    metrics.setGlobalMeterProvider(options.meterProvider);
  }

  const {
    dev,
    packages = [],
    remoteDrives = [],
    logger = defaultLogger,
  } = options;

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

  // use postgres url for read model storage if available, otherwise use local PGlite path
  const readModelPath = dbPath || ".ph/read-storage";

  // HTTP registry package loading
  let httpDocumentModels: DocumentModelModule[] = [];
  const configPath =
    options.configFile ?? path.join(process.cwd(), "powerhouse.config.json");
  const config = getConfig(configPath);
  const registryUrl = process.env.PH_REGISTRY_URL ?? config.packageRegistryUrl;
  const registryPackages = process.env.PH_REGISTRY_PACKAGES;
  let httpLoader: HttpPackageLoader | undefined;

  if (registryUrl) {
    httpLoader = new HttpPackageLoader({ registryUrl });
  }

  if (httpLoader && registryPackages) {
    const packageNames = registryPackages.split(",").map((p) => p.trim());
    httpDocumentModels = await httpLoader.loadPackages(packageNames, logger);
    logger.info(
      `Loaded ${httpDocumentModels.length} HTTP document models from ${packageNames.length} packages`,
    );
  }

  const reactorLogger = logger.child(["reactor"]);
  const initializeClient = async (documentModels: DocumentModelModule[]) => {
    const eventBus = new EventBus();
    const builder = new ReactorBuilder()
      .withEventBus(eventBus)
      .withDocumentModels(
        getUniqueDocumentModels([
          documentModelDocumentModelModule,
          driveDocumentModelModule,
          ...vetraDocumentModels,
          ...documentModels,
          ...httpDocumentModels,
        ]),
      )
      .withChannelScheme(ChannelScheme.SWITCHBOARD)
      .withSignalHandlers()
      .withLogger(reactorLogger);

    const maxSkipThreshold = parseInt(process.env.MAX_SKIP_THRESHOLD ?? "", 10);
    if (!isNaN(maxSkipThreshold) && maxSkipThreshold > 0) {
      builder.withExecutorConfig({ maxSkipThreshold });
      logger.info(`Reactor maxSkipThreshold set to ${maxSkipThreshold}`);
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

    if (httpLoader && options.dynamicModelLoading) {
      builder.withDocumentModelLoader(httpLoader);
    }

    const clientBuilder = new ReactorClientBuilder().withReactorBuilder(
      builder,
    );

    if (renown) {
      clientBuilder.withSigner(renown.signer);
    }

    const module = await clientBuilder.buildModule();

    if (module.reactorModule) {
      const instrumentation = new ReactorInstrumentation(module.reactorModule);
      instrumentation.start();
      reactorLogger.info("Reactor metrics instrumentation started");
    }

    return module;
  };

  let defaultDriveUrl: undefined | string = undefined;

  // TODO get path from powerhouse config
  // start vite server if dev mode is enabled
  const basePath = process.cwd();
  const viteLogger = createViteLogger(logger);
  const vite = dev
    ? await startViteServer(process.cwd(), viteLogger)
    : undefined;

  // get paths to local document models
  if (!options.disableLocalPackages) {
    packages.push(basePath);
  }

  // create loader
  const packageLoader = vite ? VitePackageLoader.build(vite) : undefined;

  const apiLogger = logger.child(["reactor-api"]);
  const api = await initializeAndStartAPI(
    initializeClient,
    {
      express: app,
      port: serverPort,
      dbPath: readModelPath,
      https: options.https,
      packageLoader,
      packages: packages,
      processorConfig: options.processorConfig,
      processors: {
        "@powerhousedao/vetra": [vetraProcessorFactory],
      },
      configFile:
        options.configFile ??
        path.join(process.cwd(), "powerhouse.config.json"),
      mcp: options.mcp ?? true,
      logger: apiLogger,
      enableDocumentModelSubgraphs: options.enableDocumentModelSubgraphs,
    },
    "switchboard",
  );

  const { client, graphqlManager, documentModelRegistry } = api;

  // Wire up dynamic package management if HTTP loader is configured
  if (httpLoader) {
    const packageManagementService = new PackageManagementService({
      defaultRegistryUrl: registryUrl,
      httpLoader,
      documentModelRegistry,
    });

    packageManagementService.setOnModelsChanged(async () => {
      await graphqlManager.regenerateDocumentModelSubgraphs();
    });

    const packagesSubgraph = new PackagesSubgraph({
      relationalDb: undefined as never,
      analyticsStore: undefined as never,
      reactorClient: client,
      graphqlManager,
      syncManager: api.syncManager,
      path: graphqlManager.getBasePath(),
      packageManagementService,
    });

    void graphqlManager
      .registerSubgraphInstance(packagesSubgraph, "graphql", false)
      .then(() => graphqlManager.updateRouter())
      .catch((error: unknown) => {
        logger.error("Failed to register packages subgraph: @error", error);
      });
  }

  // Create default drive if provided
  if (options.drive) {
    if (!renown) {
      throw new Error("Cannot create default drive without Renown identity");
    }

    defaultDriveUrl = await addDefaultDrive(client, options.drive, serverPort);
  }

  // add vite middleware after express app is initialized if applicable
  if (vite) {
    api.app.mountRawMiddleware(vite.middlewares);
  }

  // Connect to remote drives AFTER packages are loaded
  if (remoteDrives.length > 0) {
    for (const remoteDriveUrl of remoteDrives) {
      let driveId: string | undefined;

      try {
        const { syncManager } = api;
        const parsed = parseDriveUrl(remoteDriveUrl);
        driveId = parsed.driveId;
        const remoteName = `remote-drive-${driveId}-${crypto.randomUUID()}`;
        await syncManager.add(remoteName, driveCollectionId("main", driveId), {
          type: "gql",
          parameters: { url: parsed.graphqlEndpoint },
        });
        logger.debug("Remote drive @remoteDriveUrl synced", remoteDriveUrl);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("already exists")
        ) {
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
    reactor: client,
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

  const logger = options.logger ?? defaultLogger;

  logger.info(
    "Feature flags: @flags",
    JSON.stringify(
      {
        DOCUMENT_MODEL_SUBGRAPHS_ENABLED: enableDocumentModelSubgraphs,
      },
      null,
      2,
    ),
  );

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
