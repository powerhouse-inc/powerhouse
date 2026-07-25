#!/usr/bin/env node
import type { PGlite } from "@electric-sql/pglite";
import { getConfig } from "@powerhousedao/config/node";
import { ReactorInstrumentation } from "@powerhousedao/opentelemetry-instrumentation-reactor";
import { AtomicNodeFs } from "@powerhousedao/pglite-fs";
import {
  DriveCollectionId,
  EventBus,
  REACTOR_SCHEMA,
  ReactorBuilder,
  ReactorClientBuilder,
  parseDriveUrl,
  type Database,
  type JwtHandler,
} from "@powerhousedao/reactor";
import {
  HttpPackageLoader,
  ImportPackageLoader,
  PackageManagementService,
  PackagesSubgraph,
  initializeAndStartAPI,
  type ClientInitializerDependencies,
  type IPackageLoader,
} from "@powerhousedao/reactor-api";
import { httpsHooksPath } from "@powerhousedao/reactor-api/https-hooks";
import type { VitePackageLoader } from "@powerhousedao/reactor-api/vite";
import { createRemoteAttachmentService } from "@powerhousedao/reactor-attachments";
import {
  DriveNodeView,
  NodeProcessor,
  ReactorDriveClient,
  createReactorDriveResolvers,
  reactorDriveSubgraphTypeDefs,
  type ReactorDriveDatabase,
} from "@powerhousedao/reactor-drive";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import type { IRenown } from "@renown/sdk/node";
import * as Sentry from "@sentry/node";
import { childLogger, setLogLevel, type ILogger } from "document-model";
import dotenv from "dotenv";
import { Kysely, PostgresDialect } from "kysely";
import { promises as fs } from "node:fs";
import { register } from "node:module";
import net from "node:net";
import path from "path";
import { Pool } from "pg";
import type { ViteDevServer } from "vite";
import { registerAttachmentRoutes } from "./attachments/index.js";
import {
  registerAttachmentReferenceReadModel,
  registerAttachmentReferenceReadModelOnModule,
} from "./attachment-reference-read-model.mjs";
import { applySwitchboardReactorDefaults } from "./builder-defaults.mjs";
import {
  buildWorkerDbConfig,
  resolveWorkerModelSources,
  resolveWorkerPoolOptions,
} from "./worker-pool.mjs";
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
import {
  addDefaultDrive,
  addDefaultReactorDrive,
  isPostgresUrl,
} from "./utils.mjs";

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

async function createReactorKysely(opts: {
  reactorDbUrl: string | undefined;
  reactorPgliteDir: string | null;
  reactorPgliteMajor: SupportedPgMajor | null;
  inMemory: boolean;
  flushIntervalMs: number;
  logger: ILogger;
}): Promise<Kysely<Database>> {
  const {
    reactorDbUrl,
    reactorPgliteDir,
    reactorPgliteMajor,
    inMemory,
    flushIntervalMs,
    logger,
  } = opts;

  if (reactorDbUrl && isPostgresUrl(reactorDbUrl)) {
    const connectionString = reactorDbUrl.includes("?")
      ? reactorDbUrl
      : `${reactorDbUrl}?sslmode=disable`;
    const pool = new Pool({ connectionString });
    logger.info("Using PostgreSQL for reactor storage");
    return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
  }

  if (!reactorPgliteDir || reactorPgliteMajor === null) {
    throw new Error("Reactor PGLite directory not resolved");
  }
  const { PGlite } = await loadPGliteModule(reactorPgliteMajor);
  const pglite = inMemory
    ? new PGlite()
    : new PGlite({
        fs: new AtomicNodeFs(reactorPgliteDir, { logger, flushIntervalMs }),
      });
  logger.info(
    inMemory
      ? `Using in-memory PGlite (PG${reactorPgliteMajor}) for reactor storage [PH_PGLITE_IN_MEMORY=1]`
      : `Using PGlite (PG${reactorPgliteMajor}) for reactor storage at ${reactorPgliteDir}`,
  );
  return new Kysely<Database>({ dialect: new ClosablePGliteDialect(pglite) });
}

/** Derive the remote attachment service config for switchboard's own `/attachments/*` API. */
export function deriveAttachmentServiceConfig(
  options: Pick<StartServerOptions, "attachmentServiceUrl" | "https">,
  serverPort: number,
  renown: IRenown | null,
): { remoteUrl: string; jwtHandler: JwtHandler | undefined } {
  const protocol = options.https ? "https" : "http";
  const remoteUrl =
    options.attachmentServiceUrl ??
    process.env.PH_SWITCHBOARD_PUBLIC_URL ??
    `${protocol}://localhost:${serverPort}`;
  const jwtHandler: JwtHandler | undefined = renown
    ? async (url: string) =>
        renown.user
          ? renown.getBearerToken({ expiresIn: 10, aud: url })
          : undefined
    : undefined;
  return { remoteUrl, jwtHandler };
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
    options.dbPath ??
    process.env.PH_REACTOR_DATABASE_URL ??
    process.env.PH_SWITCHBOARD_DATABASE_URL;
  // When the caller passes in a reactor, the reactor-side PGLite dir is
  // unused — the caller owns its own storage. Only the read-model dir is
  // still needed by reactor-api itself.
  const reactorPath = reactorDbUrl || "./.ph/reactor-storage";
  const reactorPgliteDir = options.reactor
    ? null
    : !reactorDbUrl || !isPostgresUrl(reactorDbUrl)
      ? reactorPath
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

  // delete PGLite's lockfile to recover, in case it didn't have time to close
  for (const dir of pgliteDirs) {
    const lockPath = path.join(dir, "postmaster.pid");
    try {
      await fs.unlink(lockPath);
      logger.warn(`Removed stale PGLite lockfile ${lockPath}`);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }

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

  let workerPool = resolveWorkerPoolOptions(options.workerPool, process.env);
  if (workerPool && options.reactor) {
    logger.warn(
      "Worker pool configuration ignored: the caller-provided reactor owns its own executor",
    );
    workerPool = null;
  }
  if (workerPool) {
    if (dev) {
      throw new Error(
        "The executor worker pool (REACTOR_WORKERS) is not supported in dev mode: Vite-loaded document models cannot cross a worker-thread boundary",
      );
    }
    if (!reactorDbUrl || !isPostgresUrl(reactorDbUrl)) {
      throw new Error(
        "The executor worker pool (REACTOR_WORKERS) requires a Postgres reactor database — set PH_REACTOR_DATABASE_URL or PH_SWITCHBOARD_DATABASE_URL. PGlite cannot be shared across worker threads.",
      );
    }
  }

  // The reactor-api owns its own PGlite/HTTP/WS resources but has no shutdown
  // path of its own; we register `api.dispose` as a reactor shutdown hook so
  // those resources drain inside the reactor's SIGINT chain. The reference
  // is forward — `initializeClient` runs (and registers the hook) before
  // `initializeAndStartAPI` returns the api — so the closure reads `apiRef`
  // at hook-fire time, not at registration time.
  const apiRef: { current: { dispose: () => Promise<void> } | undefined } = {
    current: undefined,
  };
  let driveNodeView: DriveNodeView | undefined;

  // HTTP registry package loading
  const configPath =
    options.configFile ?? path.join(process.cwd(), "powerhouse.config.json");
  const config = getConfig(configPath);
  const registryUrl =
    options.registryUrl ??
    process.env.PH_REGISTRY_URL ??
    config.packageRegistryUrl;
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
  const initializeClient = async (
    documentModels: DocumentModelModule[],
    { attachmentReferenceWriter }: ClientInitializerDependencies,
  ) => {
    // When the caller hands us a pre-built reactor module, reuse it
    // instead of constructing one. The caller owns the reactor lifecycle
    // and must call `switchboard.shutdown()` from their own teardown to
    // drain /graphql, MCP, attachments, etc.
    if (options.reactor) {
      const attachmentReferenceProjection =
        await registerAttachmentReferenceReadModelOnModule(
          options.reactor,
          attachmentReferenceWriter,
        );
      if (options.reactor.reactorModule) {
        const instrumentation = new ReactorInstrumentation(
          options.reactor.reactorModule,
        );
        instrumentation.start();
        reactorLogger.info(
          "Reactor metrics instrumentation started (using caller-provided reactor)",
        );
      }
      return {
        module: options.reactor,
        attachmentReferenceProjection,
      };
    }

    const baseKysely = await createReactorKysely({
      reactorDbUrl,
      reactorPgliteDir,
      reactorPgliteMajor,
      inMemory: PGLITE_IN_MEMORY,
      flushIntervalMs: PGLITE_FLUSH_INTERVAL_MS,
      logger,
    });

    const maxSkipThreshold = parseInt(process.env.MAX_SKIP_THRESHOLD ?? "", 10);
    const hasSkipThreshold = !isNaN(maxSkipThreshold) && maxSkipThreshold > 0;
    if (hasSkipThreshold) {
      logger.info(`Reactor maxSkipThreshold set to ${maxSkipThreshold}`);
    }
    if (hasSkipThreshold && workerPool) {
      logger.warn(
        "MAX_SKIP_THRESHOLD is not forwarded to executor workers and has no effect in worker-pool mode",
      );
    }

    const reactorBuilder = new ReactorBuilder()
      .withEventBus(new EventBus())
      .withKysely(baseKysely);

    const clientBuilder = new ReactorClientBuilder().withReactorBuilder(
      reactorBuilder,
    );

    // Subpath import keeps vetra's React editors out of the node bundle.
    const vetraDocumentModels: DocumentModelModule[] = dev
      ? (
          Object.values(
            await import("@powerhousedao/vetra/document-models"),
          ) as unknown[]
        ).filter(
          (m): m is DocumentModelModule =>
            typeof m === "object" &&
            m !== null &&
            "documentModel" in m &&
            "reducer" in m,
        )
      : [];

    applySwitchboardReactorDefaults(reactorBuilder, clientBuilder, {
      documentModels: [...documentModels, ...vetraDocumentModels],
      executorConfig: hasSkipThreshold ? { maxSkipThreshold } : undefined,
      documentModelLoader:
        httpLoader && dynamicModelLoading
          ? httpLoader.documentModelLoader
          : undefined,
      logger: reactorLogger,
      signer: renown
        ? getRenownSignerConfig(renown, options.identity?.requireSignatures)
        : undefined,
    });

    if (workerPool) {
      if (!reactorDbUrl) {
        throw new Error(
          "unreachable: worker pool enabled without a reactor database URL",
        );
      }
      // File sources give workers importable paths for the same models the
      // live modules above registered; the builder dedupes and fails the
      // boot if any model lacks an importable source.
      const workerSources = await resolveWorkerModelSources(
        packages,
        reactorLogger,
      );
      reactorBuilder.withDocumentModelSources(workerSources).withWorkerPool({
        numWorkers: workerPool.numWorkers,
        db: buildWorkerDbConfig(reactorDbUrl, workerPool),
      });
      reactorLogger.info(
        `Executor worker pool enabled: ${workerPool.numWorkers} worker threads${
          workerPool.mode === "auto" ? " (auto-sized from cores)" : ""
        }`,
      );
    }

    reactorBuilder.withReadModelFactory(
      async ({
        operationIndex,
        writeCache,
        processorManagerConsistencyTracker,
      }) => {
        const nodeProcessor = new NodeProcessor(
          baseKysely as unknown as Kysely<unknown>,
          REACTOR_SCHEMA,
          operationIndex,
          writeCache,
          processorManagerConsistencyTracker,
        );
        await nodeProcessor.init();
        return nodeProcessor;
      },
    );

    registerAttachmentReferenceReadModel(reactorBuilder, {
      baseKysely: baseKysely as unknown as Kysely<unknown>,
      attachmentReferenceWriter,
    });

    reactorBuilder.withShutdownHook(async () => {
      if (apiRef.current) await apiRef.current.dispose();
    });

    const module = await clientBuilder.buildModule();

    if (module.reactorModule) {
      const instrumentation = new ReactorInstrumentation(module.reactorModule);
      instrumentation.start();
      reactorLogger.info("Reactor metrics instrumentation started");
    }

    const reactorDriveSchemaDb = baseKysely.withSchema(
      REACTOR_SCHEMA,
    ) as unknown as Kysely<ReactorDriveDatabase>;
    driveNodeView = new DriveNodeView(reactorDriveSchemaDb);
    const reactorDriveClient = new ReactorDriveClient({
      reactor: module.client,
      readModel: driveNodeView,
    });

    return {
      module,
      reactorDriveClient,
      attachmentReferenceProjection: { status: "available" as const },
    };
  };

  let defaultDriveUrl: undefined | string = undefined;

  // TODO get path from powerhouse config
  const basePath = process.cwd();

  // import Vite loader only if dev mode is enabled
  let vite: ViteDevServer | undefined;
  let viteLoader: VitePackageLoader | undefined;
  if (dev) {
    const { VitePackageLoader, createViteLogger, startViteServer } =
      await import("@powerhousedao/reactor-api/vite");
    vite = await startViteServer(process.cwd(), createViteLogger(logger));
    viteLoader = VitePackageLoader.build(vite);
  }

  // Vetra is builder-only and bundled (not CDN-loadable); lazy-load its
  // processor only in dev, where builder tooling runs (e.g. `ph vetra`).
  const vetraProcessorFactory = dev
    ? (await import("@powerhousedao/vetra/processors")).processorFactory
    : undefined;

  // get paths to local document models
  if (!options.disableLocalPackages) {
    packages.push(basePath);
  }

  // create loaders
  const packageLoaders: IPackageLoader[] = [];
  if (viteLoader) {
    packageLoaders.push(viteLoader);
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
      processors: vetraProcessorFactory
        ? { "@powerhousedao/vetra": [vetraProcessorFactory] }
        : {},
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

  const attachmentService = createRemoteAttachmentService(
    deriveAttachmentServiceConfig(options, serverPort, renown),
  );

  if (process.env.SENTRY_DSN) {
    // Register Sentry error handler after all routes are established.
    // The adapter calls the framework-specific Sentry setup internally.
    api.httpAdapter.setupSentryErrorHandler(Sentry);
  }

  const { client, graphqlManager, documentModelRegistry } = api;

  const lateSubgraphs: Promise<unknown>[] = [];

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
      authorizationService: graphqlManager.getAuthorizationService(),
      packageManagementService,
    });

    lateSubgraphs.push(
      graphqlManager
        .registerSubgraphInstance(packagesSubgraph, "graphql", false)
        .catch((error: unknown) => {
          logger.error("Failed to register packages subgraph: @error", error);
        }),
    );
  }

  if (driveNodeView) {
    graphqlManager.setAdditionalContextFields({
      readModel: driveNodeView,
    });

    const reactorDriveSubgraph = {
      name: "reactor-drive",
      path: graphqlManager.getBasePath(),
      resolvers: createReactorDriveResolvers(),
      typeDefs: reactorDriveSubgraphTypeDefs,
      reactorClient: client,
      relationalDb: undefined as never,
    };

    lateSubgraphs.push(
      graphqlManager
        .registerSubgraphInstance(reactorDriveSubgraph, "graphql", false)
        .catch((error: unknown) => {
          logger.error(
            "Failed to register reactor-drive subgraph: @error",
            error,
          );
        }),
    );
  }

  void (async () => {
    await Promise.all(lateSubgraphs);
    try {
      await graphqlManager.updateRouter(true);
    } catch (error) {
      logger.error(
        "Final router update before readiness failed: @error",
        error,
      );
    }
    api.readiness.markReady();
  })();

  // Create default drive if provided
  if (options.drive) {
    if (!renown) {
      throw new Error("Cannot create default drive without Renown identity");
    }

    const driveType = options.drive.documentType ?? "powerhouse/document-drive";
    if (driveType === "powerhouse/reactor-drive") {
      defaultDriveUrl = await addDefaultReactorDrive(
        client,
        options.drive,
        serverPort,
      );
    } else {
      defaultDriveUrl = await addDefaultDrive(
        client,
        options.drive,
        serverPort,
      );
    }
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
        await syncManager.add(remoteName, DriveCollectionId.forDrive(driveId), {
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
    attachmentService,
    attachmentReferenceProjection: api.attachmentReferenceProjection,
    renown,
    port: serverPort,
    shutdown: () => api.dispose(),
  };
}

/**
 * Boot the switchboard HTTP/GraphQL/MCP stack on top of a reactor.
 *
 * If `options.reactor` is provided, the switchboard reuses it instead of
 * building its own — the caller then owns the reactor's lifecycle and is
 * responsible for invoking `SwitchboardReactor.shutdown()` from their own
 * teardown / SIGINT path. The switchboard will not reach into the caller's
 * reactor; killing the reactor alone leaves the api/GraphQL/MCP resources
 * dangling until the process exits.
 *
 * When `options.reactor` is omitted, the switchboard builds and owns the
 * reactor. `shutdown()` on the returned handle only drains the api (HTTP
 * server, GraphQL, MCP, attachments); the reactor itself is torn down by
 * its own signal handlers (`withSignalHandlers`), which call `kill()` and
 * trigger the `withShutdownHook` chain that disposes the api. Programmatic
 * full teardown isn't currently exposed — wire it via SIGINT/SIGTERM.
 */
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
    if (options.identity.requireExisting) {
      throw new Error(
        'Identity required but failed to initialize. Run "ph login" first.',
        { cause: e },
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

export {
  applySwitchboardReactorDefaults,
  type SwitchboardReactorDefaultsOptions,
} from "./builder-defaults.mjs";
export * from "./types.js";

if (import.meta.main) {
  await startSwitchboard();
}
