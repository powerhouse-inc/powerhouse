#!/usr/bin/env node
import type { PGlite } from "@electric-sql/pglite";
import { getConfig } from "@powerhousedao/config/node";
import { ReactorInstrumentation } from "@powerhousedao/opentelemetry-instrumentation-reactor";
import { AtomicNodeFs } from "@powerhousedao/pglite-fs";
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
  ImportPackageLoader,
  PackageManagementService,
  PackagesSubgraph,
  getUniqueDocumentModels,
  initializeAndStartAPI,
  type IPackageLoader,
} from "@powerhousedao/reactor-api";
import { httpsHooksPath } from "@powerhousedao/reactor-api/https-hooks";
import {
  VitePackageLoader,
  createViteLogger,
  startViteServer,
} from "@powerhousedao/reactor-api/vite";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { documentModels as vetraDocumentModels } from "@powerhousedao/vetra";
import { processorFactory as vetraProcessorFactory } from "@powerhousedao/vetra/processors";
import type { IRenown } from "@renown/sdk/node";
import * as Sentry from "@sentry/node";
import {
  childLogger,
  documentModelDocumentModelModule,
  setLogLevel,
  type ILogger,
} from "document-model";
import dotenv from "dotenv";
import { Kysely, PostgresDialect } from "kysely";
import { promises as fs } from "node:fs";
import { register } from "node:module";
import net from "node:net";
import path from "path";
import { Pool } from "pg";
import { registerAttachmentRoutes } from "./attachments/index.js";
import { initFeatureFlags } from "./feature-flags.js";
import { ClosablePGliteDialect } from "./pglite-dialect.js";
import { migratePgliteDir } from "./pglite-migration.js";
import {
  CURRENT_PG_MAJOR,
  isSupportedMajor,
  loadPGliteModule,
  readPgVersionFile,
  type SupportedPgMajor,
} from "./pglite-version.js";
import { getRenownSignerConfig, initRenown } from "./renown.js";
import type { StartServerOptions, SwitchboardReactor } from "./types.js";
import { addDefaultDrive, isPostgresUrl } from "./utils.mjs";

const defaultLogger = childLogger(["switchboard"]);

const LogLevel = (process.env.LOG_LEVEL as ILogger["level"] | "") || "info";
setLogLevel(LogLevel);

dotenv.config();

// Feature flag constants
const DOCUMENT_MODEL_SUBGRAPHS_ENABLED = "DOCUMENT_MODEL_SUBGRAPHS_ENABLED";
const DOCUMENT_MODEL_SUBGRAPHS_ENABLED_DEFAULT = true;
const REQUIRE_SIGNATURES = "REQUIRE_SIGNATURES";
const REQUIRE_SIGNATURES_DEFAULT = false;

const DEFAULT_PORT = process.env.PORT ? Number(process.env.PORT) : 4001;

// How many ports forward from the requested one we will try before giving up.
const PORT_FALLBACK_ATTEMPTS = 20;

// AtomicNodeFs needs a flush interval to coalesce writes into a single disk write (only used locally)
const PGLITE_FLUSH_INTERVAL_MS = (() => {
  const raw = process.env.PGLITE_FLUSH_INTERVAL_MS;
  if (raw === undefined) return 100;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 100;
})();

// When set, runs both reactor and read-model PGLite instances purely in-memory.
const PGLITE_IN_MEMORY = process.env.PH_PGLITE_IN_MEMORY === "1";

/**
 * Attempt to bind a throwaway TCP server to the given port. Resolves true if
 * the port is free, false if the OS reports it in use. Any other error is
 * surfaced so we don't silently mask real issues (permissions, bad host, …).
 */
export function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const tester = net.createServer();
    tester.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE" || err.code === "EACCES") {
        resolve(false);
      } else {
        reject(err);
      }
    });
    tester.once("listening", () => {
      tester.close(() => resolve(true));
    });
    // Bind on the unspecified IPv6 address so we detect collisions with both
    // IPv6 and IPv4 listeners (Node maps `::` to dual-stack on most systems).
    tester.listen({ port, host: "::" });
  });
}

async function resolveServerPort(
  requested: number,
  strictPort: boolean,
  logger: ILogger,
): Promise<number> {
  if (strictPort) return requested;
  for (let i = 0; i < PORT_FALLBACK_ATTEMPTS; i++) {
    const candidate = requested + i;
    if (await isPortAvailable(candidate)) {
      if (candidate !== requested) {
        logger.info(
          `Port ${requested} is in use. Falling back to port ${candidate}.`,
        );
      }
      return candidate;
    }
  }
  // Couldn't find a free port in the window; let the caller surface the
  // original EADDRINUSE when the real bind attempts runs.
  return requested;
}

async function initServer(
  serverPort: number,
  options: StartServerOptions,
  renown: IRenown | null,
) {
  const {
    dev,
    packages = [],
    remoteDrives = [],
    logger = defaultLogger,
  } = options;
  logger.level = LogLevel;
  const dbPath =
    options.dbPath ??
    process.env.DATABASE_URL ??
    process.env.PH_SWITCHBOARD_DATABASE_URL;

  // use postgres url for read model storage if available, otherwise use local PGlite path
  const readModelPath = dbPath || ".ph/read-storage";

  const reactorDbUrl =
    process.env.PH_REACTOR_DATABASE_URL ??
    process.env.PH_SWITCHBOARD_DATABASE_URL;
  const reactorPgliteDir =
    !reactorDbUrl || !isPostgresUrl(reactorDbUrl)
      ? "./.ph/reactor-storage"
      : null;
  const readModelPgliteDir =
    !dbPath || !isPostgresUrl(dbPath) ? readModelPath : null;

  // PGLite version pre-flight: when PH_FORCE_PG_VERSION is set, wipe local
  // data dirs and re-initdb at the chosen version. Otherwise detect on-disk
  // PG_VERSION and either migrate (when --migrate-pglite is set) or warn and
  // fall through to the matching legacy PGLite at runtime.
  const pgliteDirs = [reactorPgliteDir, readModelPgliteDir].filter(
    (d): d is string => d !== null,
  );
  const detectedMajors = new Map<string, number>();

  if (options.forcePgVersion !== undefined && pgliteDirs.length > 0) {
    if (options.migratePglite) {
      logger.warn(
        "PH_FORCE_PG_VERSION is set; ignoring --migrate-pglite/PH_MIGRATE_PGLITE because the data dirs will be wiped.",
      );
    }
    logger.warn(
      `PH_FORCE_PG_VERSION=${options.forcePgVersion} set; wiping PGLite data dirs and re-initializing at PG${options.forcePgVersion}.`,
    );
    for (const dir of pgliteDirs) {
      await fs.rm(dir, { recursive: true, force: true });
      logger.info(`Wiped PGLite data dir ${dir}`);
    }
  } else if (options.forcePgVersion === undefined) {
    for (const dir of pgliteDirs) {
      const major = await readPgVersionFile(dir);
      if (major !== null) detectedMajors.set(dir, major);
    }

    if (options.migratePglite) {
      for (const [dir, major] of detectedMajors) {
        if (major === CURRENT_PG_MAJOR) continue;
        await migratePgliteDir(dir, logger);
        // refresh detected major after a successful migration
        const after = await readPgVersionFile(dir);
        if (after !== null) detectedMajors.set(dir, after);
      }
    } else {
      for (const [dir, major] of detectedMajors) {
        if (major === CURRENT_PG_MAJOR) continue;
        logger.warn(
          `PGLite data dir at ${dir} was created with PG${major} but Switchboard ships PG${CURRENT_PG_MAJOR}. Running on legacy PGLite. Re-start with --migrate-pglite (or PH_MIGRATE_PGLITE=true) to upgrade.`,
        );
      }
    }
  }

  function resolvePgliteMajorForDir(dir: string): SupportedPgMajor {
    if (options.forcePgVersion !== undefined) return options.forcePgVersion;
    const detected = detectedMajors.get(dir);
    if (detected === undefined) return CURRENT_PG_MAJOR;
    if (!isSupportedMajor(detected)) {
      throw new Error(
        `Unsupported PGLite data dir at ${dir}: PG_VERSION=${detected}`,
      );
    }
    return detected;
  }

  const reactorPgliteMajor = reactorPgliteDir
    ? resolvePgliteMajorForDir(reactorPgliteDir)
    : null;
  const readModelPgliteMajor = readModelPgliteDir
    ? resolvePgliteMajorForDir(readModelPgliteDir)
    : null;

  // The reactor-api owns its own PGlite/HTTP/WS resources but has no shutdown
  // path of its own; we register `api.dispose` as a reactor shutdown hook so
  // those resources drain inside the reactor's SIGINT chain. The reference
  // is forward — `initializeClient` runs (and registers the hook) before
  // `initializeAndStartAPI` returns the api — so the closure reads `apiRef`
  // at hook-fire time, not at registration time.
  const apiRef: { current: { dispose: () => Promise<void> } | undefined } = {
    current: undefined,
  };

  // HTTP registry package loading
  const configPath =
    options.configFile ?? path.join(process.cwd(), "powerhouse.config.json");
  const config = getConfig(configPath);
  const registryUrl = process.env.PH_REGISTRY_URL ?? config.packageRegistryUrl;
  const registryPackages = process.env.PH_REGISTRY_PACKAGES;
  const dynamicModelLoading =
    options.dynamicModelLoading ?? process.env.DYNAMIC_MODEL_LOADING === "true";
  let httpLoader: HttpPackageLoader | undefined;

  if (registryUrl) {
    // Register HTTP/HTTPS module loader hooks for dynamic package imports
    register(httpsHooksPath, import.meta.url);
    httpLoader = new HttpPackageLoader({ registryUrl });
    registryPackages?.split(",").forEach((p) => {
      const name = p.trim();
      if (!packages.includes(name)) {
        packages.push(name);
      }
    });
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
      if (!reactorPgliteDir || reactorPgliteMajor === null) {
        throw new Error("Reactor PGLite directory not resolved");
      }
      const { PGlite } = await loadPGliteModule(reactorPgliteMajor);
      const pglite = PGLITE_IN_MEMORY
        ? new PGlite()
        : new PGlite({
            fs: new AtomicNodeFs(reactorPgliteDir, {
              logger,
              flushIntervalMs: PGLITE_FLUSH_INTERVAL_MS,
            }),
          });
      const kysely = new Kysely<Database>({
        dialect: new ClosablePGliteDialect(pglite),
      });
      builder.withKysely(kysely);
      logger.info(
        PGLITE_IN_MEMORY
          ? `Using in-memory PGlite (PG${reactorPgliteMajor}) for reactor storage [PH_PGLITE_IN_MEMORY=1]`
          : `Using PGlite (PG${reactorPgliteMajor}) for reactor storage at ${reactorPgliteDir}`,
      );
    }

    builder.withShutdownHook(async () => {
      if (apiRef.current) await apiRef.current.dispose();
    });

    if (httpLoader && dynamicModelLoading) {
      builder.withDocumentModelLoader(httpLoader.documentModelLoader);
    }

    const clientBuilder = new ReactorClientBuilder().withReactorBuilder(
      builder,
    );

    if (renown) {
      const signerConfig = getRenownSignerConfig(
        renown,
        options.identity?.requireSignatures,
      );
      clientBuilder.withSigner(signerConfig);
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

  // create loaders
  const packageLoaders: IPackageLoader[] = [];
  if (vite) {
    packageLoaders.push(VitePackageLoader.build(vite));
  } else {
    packageLoaders.push(new ImportPackageLoader());
  }
  if (httpLoader) {
    packageLoaders.push(httpLoader);
    registryPackages?.split(",").forEach((p) => {
      const name = p.trim();
      if (!packages.includes(name)) {
        packages.push(name);
      }
    });
  }

  const apiLogger = logger.child(["reactor-api"]);
  // When the read-model store is on disk, hand reactor-api a factory that
  // constructs the matching PGLite (current or legacy) for the detected
  // PG_VERSION. reactor-api calls the factory synchronously, so the legacy
  // module is preloaded above.
  let pgliteFactory:
    | ((connectionString: string | undefined) => PGlite)
    | undefined;
  if (readModelPgliteDir && readModelPgliteMajor !== null) {
    const { PGlite: ReadModelPGlite } =
      await loadPGliteModule(readModelPgliteMajor);
    pgliteFactory = PGLITE_IN_MEMORY
      ? () => new ReadModelPGlite()
      : (connectionString) =>
          new ReadModelPGlite({
            fs: new AtomicNodeFs(
              connectionString ?? (readModelPgliteDir as string),
              { logger, flushIntervalMs: PGLITE_FLUSH_INTERVAL_MS },
            ),
          });
  }

  const api = await initializeAndStartAPI(
    initializeClient,
    {
      port: serverPort,
      dbPath: readModelPath,
      pgliteFactory,
      https: options.https,
      packageLoaders: packageLoaders.length > 0 ? packageLoaders : undefined,
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
  apiRef.current = api;

  registerAttachmentRoutes(api);

  if (process.env.SENTRY_DSN) {
    // Register Sentry error handler after all routes are established.
    // The adapter calls the framework-specific Sentry setup internally.
    api.httpAdapter.setupSentryErrorHandler(Sentry);
  }

  const { client, graphqlManager, documentModelRegistry } = api;

  // Wire up dynamic package management if HTTP loader is configured
  if (httpLoader) {
    const packageManagementService = new PackageManagementService({
      defaultRegistryUrl: registryUrl,
      httpLoader,
      documentModelRegistry,
    });

    packageManagementService.setOnModelsChanged(() => {
      graphqlManager.regenerateDocumentModelSubgraphs().catch(logger.error);
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
    api.httpAdapter.mountRawMiddleware(vite.middlewares);
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
    port: serverPort,
  };
}

export const startSwitchboard = async (
  options: StartServerOptions = {},
): Promise<SwitchboardReactor> => {
  const requestedPort = options.port ?? DEFAULT_PORT;
  const logger = options.logger ?? defaultLogger;
  const serverPort = await resolveServerPort(
    requestedPort,
    options.strictPort ?? false,
    logger,
  );

  // Initialize feature flags
  const featureFlags = await initFeatureFlags();

  const enableDocumentModelSubgraphs = await featureFlags.getBooleanValue(
    DOCUMENT_MODEL_SUBGRAPHS_ENABLED,
    options.enableDocumentModelSubgraphs ??
      DOCUMENT_MODEL_SUBGRAPHS_ENABLED_DEFAULT,
  );

  options.enableDocumentModelSubgraphs = enableDocumentModelSubgraphs;

  const requireSignatures =
    options.identity?.requireSignatures ??
    (await featureFlags.getBooleanValue(
      REQUIRE_SIGNATURES,
      REQUIRE_SIGNATURES_DEFAULT,
    ));
  options.identity = { ...options.identity, requireSignatures };

  logger.info(
    "Feature flags: @flags",
    JSON.stringify(
      {
        DOCUMENT_MODEL_SUBGRAPHS_ENABLED: enableDocumentModelSubgraphs,
        REQUIRE_SIGNATURES: requireSignatures,
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
