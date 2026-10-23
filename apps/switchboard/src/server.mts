#!/usr/bin/env node
import type { PGlite } from "@electric-sql/pglite";
import { metrics, trace } from "@opentelemetry/api";
import { getConfig } from "@powerhousedao/config/node";
import {
  createDurableNodeFs,
  resolvePgliteFsync,
  type DurableNodeFs,
} from "@powerhousedao/reactor-api/pglite-node";
import { ReactorInstrumentation } from "@powerhousedao/opentelemetry-instrumentation-reactor";
import {
  DriveCollectionId,
  EventBus,
  IN_MEMORY_PGLITE_STORAGE_FACTS,
  PGLITE_PATH_STORAGE_FACTS,
  POSTGRES_STORAGE_FACTS,
  REACTOR_SCHEMA,
  ReactorBuilder,
  ReactorClientBuilder,
  createHybridProjectionCoordinatorFactory,
  instrumentPgPool,
  parseDriveUrl,
  type Database,
  type InProcessReactorClientModule,
  type JwtHandler,
  type PoolInstrumentation,
  type ReactorStorageFacts,
  UnsupportedStoredProtocolError,
} from "@powerhousedao/reactor";
import {
  HttpPackageLoader,
  ImportPackageLoader,
  PackageManagementService,
  PackagesSubgraph,
  PGLITE_UTC_PARSERS,
  initializeAndStartAPI,
  reportFailure,
  resolveRenownConfig,
  runDetached,
  type CanonicalDocumentId,
  type ClientInitializerDependencies,
  type CredentialVerifier,
  type IPackageLoader,
  type ResolvedRenownConfig,
} from "@powerhousedao/reactor-api";
import { httpsHooksPath } from "@powerhousedao/reactor-api/https-hooks";
import type { VitePackageLoader } from "@powerhousedao/reactor-api/vite";
import { createRemoteAttachmentService } from "@powerhousedao/reactor-attachments";
import { createAttachmentClient } from "@powerhousedao/reactor-attachments/client";
import {
  DriveNodeView,
  NodeProcessor,
  ReactorDriveClient,
  type ReactorDriveDatabase,
} from "@powerhousedao/reactor-drive";
import {
  createReactorDriveResolvers,
  REACTOR_DRIVE_SUBGRAPH_NAME,
  reactorDriveSubgraphTypeDefs,
} from "@powerhousedao/reactor-drive/subgraph";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import {
  createLocalCredentialVerifier,
  RENOWN_READ_MODEL_SUBGRAPH,
  type CredentialCheck,
  type IRenown,
  type SwitchboardRequestFn,
} from "@renown/sdk/node";
import * as Sentry from "@sentry/node";
import { childLogger, setLogLevel, type ILogger } from "document-model";
import dotenv from "dotenv";
import { Kysely, PostgresDialect } from "kysely";
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
import {
  installFatalErrorShutdown,
  triggerFatalShutdown,
} from "./fatal-shutdown.mjs";
import {
  resolvePrivacy,
  startPrivacy,
  type ResolvedPrivacy,
  type RunningPrivacy,
} from "./privacy.mjs";
import { applySwitchboardReactorDefaults } from "./builder-defaults.mjs";
import {
  createSwitchboardPluginHost,
  isPluginHostEnabled,
  type SwitchboardPluginHost,
} from "./plugin-host.mjs";
import {
  assertProjectionWorkerSupported,
  resolveProjectionWorkerOptions,
} from "./projection-worker.mjs";
import {
  buildWorkerDbConfig,
  resolveHostPoolSize,
  keepImportableSources,
  resolveWorkerModelSources,
  resolveWorkerPoolOptions,
} from "./worker-pool.mjs";
import { inspectionThrottleFromEnv } from "./inspection-throttle.mjs";
import { initProfilerFromEnv } from "./profiler.js";
import { initFeatureFlags } from "./feature-flags.js";
import { resolveInspectionEnabled } from "./inspection-flag.mjs";
import { resolveMcpEnabled } from "./mcp-flag.mjs";
import {
  WORKFLOW_PACKAGE_NAME,
  WORKFLOW_TELEMETRY_SCOPE,
  composeWorkflowRuntime,
  modelManifestSource,
  assertWorkflowPackageLoadable,
  isWorkflowSingletonConflict,
  resolveWorkflowsEnabled,
  retryWorkflowSingleton,
  workflowSingletonLossHandler,
  type WorkflowSingletonRetry,
  type ComposedWorkflowRuntime,
  type ModelManifestSource,
} from "./workflow-runtime.mjs";
import {
  ClosablePGliteDialect,
  reactorPgliteDialectOptions,
} from "./pglite-dialect.js";
import { runPglitePreflight } from "./pglite-preflight.js";
import {
  CURRENT_PG_MAJOR,
  isSupportedMajor,
  loadNodeFsClass,
  loadPGliteModule,
  type SupportedPgMajor,
} from "./pglite-version.js";
import { resolveReactorFeatureFlags } from "./reactor-feature-flags.mjs";
import { resolveCreateSignaturePolicy } from "./create-signature-policy.mjs";
import {
  assertWorkerTrustPolicy,
  getRenownSignerConfig,
  getRenownTrustPolicyConfig,
  initRenown,
} from "./renown.js";
import type { StartServerOptions, SwitchboardReactor } from "./types.js";
import {
  StoredDocumentsRefusedError,
  resolveUnsupportedStoredDocuments,
} from "./unsupported-stored-documents.mjs";
import {
  addDefaultDrive,
  addDefaultReactorDrive,
  isPostgresUrl,
} from "./utils.mjs";
import { acquireStoreLocks } from "./store-lock.mjs";
import {
  defaultStoreDirs,
  resolvePhDir,
} from "@powerhousedao/shared/clis/ph-dir";

const defaultLogger = childLogger(["switchboard"]);

const LogLevel = (process.env.LOG_LEVEL as ILogger["level"] | "") || "info";
setLogLevel(LogLevel);

dotenv.config();

// Feature flag constants
const DOCUMENT_MODEL_SUBGRAPHS_ENABLED = "DOCUMENT_MODEL_SUBGRAPHS_ENABLED";
const DOCUMENT_MODEL_SUBGRAPHS_ENABLED_DEFAULT = true;

const DEFAULT_PORT = process.env.PORT ? Number(process.env.PORT) : 4001;

// How many ports forward from the requested one we will try before giving up.
const PORT_FALLBACK_ATTEMPTS = 20;

// Retired with the snapshot store; PGlite writes through NodeFS now.
let flushIntervalWarned = false;
function warnIgnoredFlushInterval(logger: ILogger): void {
  if (flushIntervalWarned) return;
  if (process.env.PGLITE_FLUSH_INTERVAL_MS === undefined) return;
  flushIntervalWarned = true;
  logger.warn(
    "PGLITE_FLUSH_INTERVAL_MS is set but ignored: PGlite stores no longer snapshot on a timer.",
  );
}

// A Postgres PANIC (ENOSPC on WAL, a failed fdatasync) aborts the wasm
// runtime; the store is dead and the process must not keep accepting writes.
function onPgliteAbort(logger: ILogger, what: unknown): void {
  if (!triggerFatalShutdown("PGlite aborted", what)) {
    logger.error("PGlite aborted: @error", what);
  }
}

// 0.2.17 syncs WAL through open_datasync, which NODEFS cannot honour, so on
// PG16 only checkpoints reach the host disk; commits are durable against an
// app crash, not a power loss, until --migrate-pglite upgrades the dir.
function pgliteFsyncFor(
  major: SupportedPgMajor,
  dir: string,
  logger: ILogger,
): boolean {
  const wanted = resolvePgliteFsync(process.env);
  if (wanted && major === 16) {
    logger.warn(
      `PGlite data dir ${dir} is PG16 on pglite-legacy-02, which does not sync commits to disk; only checkpoints are synced until --migrate-pglite upgrades it.`,
    );
  }
  return wanted;
}

/** Preloads the module's NodeFS so the returned factory can be synchronous. */
async function loadDurableFsFactory(
  major: SupportedPgMajor,
  logger: ILogger,
): Promise<(dir: string) => DurableNodeFs> {
  const NodeFS = await loadNodeFsClass(major);
  return (dir) =>
    createDurableNodeFs(NodeFS, dir, {
      fsync: pgliteFsyncFor(major, dir, logger),
      logger,
      onAbort: (what) => onPgliteAbort(logger, what),
    });
}

// When set, runs both reactor and read-model PGLite instances purely in-memory.
const PGLITE_IN_MEMORY = process.env.PH_PGLITE_IN_MEMORY === "1";

/**
 * Attempt to bind a throwaway TCP server to the given port. Resolves true if
 * the port is free, false if the OS reports it in use. Any other error is
 * surfaced so we don't silently mask real issues (permissions, bad host, …).
 */
export async function isPortAvailable(port: number): Promise<boolean> {
  try {
    // `::` is dual-stack on most systems, so it sees IPv6 and IPv4 listeners.
    return await probePort(port, "::");
  } catch (error) {
    // A host without IPv6, e.g. a container, can only probe IPv4.
    if (!isNoIpv6Error(error)) throw portProbeError(port, error);
    try {
      return await probePort(port, "0.0.0.0");
    } catch (ipv4Error) {
      throw portProbeError(port, ipv4Error);
    }
  }
}

const isNoIpv6Error = (error: unknown) =>
  ["EAFNOSUPPORT", "EADDRNOTAVAIL"].includes(
    (error as NodeJS.ErrnoException).code ?? "",
  );

const portProbeError = (port: number, error: unknown) =>
  new Error(
    `Could not check whether port ${port} is free: ${error instanceof Error ? error.message : String(error)}`,
    { cause: error },
  );

function probePort(port: number, host: string): Promise<boolean> {
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
    tester.listen({ port, host });
  });
}

/** The powerhouse.config.json this run reads, defaulting to the cwd copy. */
function resolveConfigPath(configFile: string | undefined): string {
  return configFile ?? path.join(process.cwd(), "powerhouse.config.json");
}

// An unreadable config file means "not configured", not a boot failure:
// workflows are opt-in.
function readConfigWorkflowsEnabled(configPath: string): boolean {
  try {
    return getConfig(configPath).workflows?.enabled ?? false;
  } catch {
    return false;
  }
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

/**
 * The reactor's storage handle, plus the pool instrumentation when that
 * storage is Postgres. The PGlite branch has no `pg.Pool` at all, so the
 * instrumentation is absent rather than optional-by-convention.
 */
type ReactorStorage = {
  kysely: Kysely<Database>;
  poolInstrumentation: PoolInstrumentation | undefined;
  storageFacts: ReactorStorageFacts;
};

export async function createReactorKysely(opts: {
  reactorDbUrl: string | undefined;
  reactorPgliteDir: string | null;
  reactorPgliteMajor: SupportedPgMajor | null;
  inMemory: boolean;
  /**
   * Resolved lazily: only the Postgres branch has a host pool, and
   * {@link resolveHostPoolSize} throws on a bad REACTOR_DB_POOL_SIZE_HOST.
   * Called eagerly it would fail a PGlite-backed server over a value that
   * path never reads.
   */
  hostPoolSize: () => number;
  logger: ILogger;
}): Promise<ReactorStorage> {
  const {
    reactorDbUrl,
    reactorPgliteDir,
    reactorPgliteMajor,
    inMemory,
    hostPoolSize,
    logger,
  } = opts;

  if (reactorDbUrl && isPostgresUrl(reactorDbUrl)) {
    const connectionString = reactorDbUrl.includes("?")
      ? reactorDbUrl
      : `${reactorDbUrl}?sslmode=disable`;
    const poolSize = hostPoolSize();
    const pool = new Pool({ connectionString, max: poolSize });
    // Named to match the reactor's own convention for the pools it opens
    // itself (`reactor-worker-N`, `projection-shard-N`).
    const poolInstrumentation = instrumentPgPool(pool, "reactor-host");
    logger.info(
      `Using PostgreSQL for reactor storage (host pool max ${poolSize})`,
    );
    return {
      kysely: new Kysely<Database>({ dialect: new PostgresDialect({ pool }) }),
      poolInstrumentation,
      storageFacts: POSTGRES_STORAGE_FACTS,
    };
  }

  if (!reactorPgliteDir || reactorPgliteMajor === null) {
    throw new Error("Reactor PGLite directory not resolved");
  }
  const { PGlite } = await loadPGliteModule(reactorPgliteMajor);
  const pglite = inMemory
    ? new PGlite()
    : new PGlite({
        fs: (await loadDurableFsFactory(reactorPgliteMajor, logger))(
          reactorPgliteDir,
        ),
      });
  logger.info(
    inMemory
      ? `Using in-memory PGlite (PG${reactorPgliteMajor}) for reactor storage [PH_PGLITE_IN_MEMORY=1]`
      : `Using PGlite (PG${reactorPgliteMajor}) for reactor storage at ${reactorPgliteDir}`,
  );
  return {
    kysely: new Kysely<Database>({
      dialect: new ClosablePGliteDialect(
        pglite,
        reactorPgliteDialectOptions(logger),
      ),
    }),
    poolInstrumentation: undefined,
    storageFacts: inMemory
      ? IN_MEMORY_PGLITE_STORAGE_FACTS
      : PGLITE_PATH_STORAGE_FACTS,
  };
}

export interface PgliteStorageDirs {
  /** Read-model store: a Postgres URL or a PGlite dir. */
  readModelPath: string;
  /** Reactor store: a Postgres URL or a PGlite dir. */
  reactorPath: string;
  /** PGlite dir for the reactor, null for Postgres or a caller-owned reactor. */
  reactorPgliteDir: string | null;
  /** PGlite dir for the read model, null for Postgres. */
  readModelPgliteDir: string | null;
  /** The PGlite dirs for the pre-flight, as before (not deduplicated). */
  pgliteDirs: string[];
  /** Set when BOTH stores are PGlite on one dir (see resolvePgliteStorageDirs). */
  sharedPgliteDir: string | null;
}

/**
 * Where the two stores live — the classic resolution, relocated verbatim.
 * Classic layout: `./.ph/reactor-storage` for the reactor and
 * `.ph/read-storage` for the read model (the same names inside
 * `${userData}/.ph` under a shell's PH_USER_DATA_DIR). `dbPath` also names
 * the reactor store unless PH_REACTOR_DATABASE_URL does: with `dbPath` alone
 * both stores share one location. That is the long-standing contract of
 * `--db-path` and fine for one Postgres database, but for PGlite it is two
 * postmasters on one data dir — reported via `sharedPgliteDir` so the caller
 * warns. Not refused: changing that contract is a separate decision.
 */
export function resolvePgliteStorageDirs(opts: {
  dbPath: string | undefined;
  reactorDbUrl: string | undefined;
  /** The caller passed its own reactor — the reactor-side dir is unused. */
  callerReactor: boolean;
  phDir?: string;
}): PgliteStorageDirs {
  const { dbPath, reactorDbUrl, callerReactor } = opts;
  const defaults = defaultStoreDirs(process.env, opts.phDir);
  const readModelPath = dbPath || defaults.readModel;
  const reactorPath = reactorDbUrl || defaults.reactor;
  const reactorPgliteDir = callerReactor
    ? null
    : !reactorDbUrl || !isPostgresUrl(reactorDbUrl)
      ? reactorPath
      : null;
  const readModelPgliteDir =
    !dbPath || !isPostgresUrl(dbPath) ? readModelPath : null;
  const sharedPgliteDir =
    reactorPgliteDir !== null &&
    readModelPgliteDir !== null &&
    path.resolve(reactorPgliteDir) === path.resolve(readModelPgliteDir)
      ? path.resolve(reactorPgliteDir)
      : null;
  const pgliteDirs = [reactorPgliteDir, readModelPgliteDir].filter(
    (d): d is string => d !== null,
  );
  return {
    readModelPath,
    reactorPath,
    reactorPgliteDir,
    readModelPgliteDir,
    pgliteDirs,
    sharedPgliteDir,
  };
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
  renownConfig: ResolvedRenownConfig,
) {
  const {
    dev,
    packages = [],
    remoteDrives = [],
    logger = defaultLogger,
  } = options;

  // R2 plugin pipeline (FEATURE_PLUGIN_HOST_ENABLED): flag off, the inline
  // path below runs byte-identically; flag on, carved subsystems run as
  // built-in plugins through the hook moments marked along this function.
  const pluginHost: SwitchboardPluginHost | null = isPluginHostEnabled()
    ? createSwitchboardPluginHost(
        {
          logger,
          options: options as unknown as Record<string, unknown>,
          renown,
        },
        options.pluginComposition,
      )
    : null;
  if (pluginHost) {
    options = await pluginHost.transformOptions(options);
    // Presence is activation: whatever no plugin (or explicit option) set
    // stays OFF. The mcp/workflows plugins set these true at
    // transformServerOptions; their absence must actually deactivate.
    options.mcp ??= false;
    options.workflows = { enabled: options.workflows?.enabled === true };
  }
  logger.level = LogLevel;
  const dbPath =
    options.dbPath ??
    process.env.DATABASE_URL ??
    process.env.PH_SWITCHBOARD_DATABASE_URL;

  const reactorDbUrl =
    options.dbPath ??
    process.env.PH_REACTOR_DATABASE_URL ??
    process.env.PH_SWITCHBOARD_DATABASE_URL;
  // Postgres URLs or local PGlite dirs under the project's .ph tree. When
  // the caller passes in a reactor, the reactor-side PGLite dir is unused —
  // the caller owns its own storage. Only the read-model dir is still needed
  // by reactor-api itself. Refuses one PGlite dir for both stores.
  const {
    readModelPath,
    reactorPgliteDir,
    readModelPgliteDir,
    pgliteDirs,
    sharedPgliteDir,
  } = resolvePgliteStorageDirs({
    dbPath,
    reactorDbUrl,
    callerReactor: options.reactor !== undefined,
  });
  if (sharedPgliteDir !== null) {
    logger.warn(
      `The reactor and read-model PGlite stores share one directory (${sharedPgliteDir}): ` +
        "two PGlite instances on one data dir can abort at the first checkpoint and leave the store unopenable. " +
        "Set PH_REACTOR_DATABASE_URL to a separate directory, or leave dbPath unset for the classic " +
        "./.ph/reactor-storage + .ph/read-storage layout.",
    );
  }

  // PGLite pre-flight: convert legacy single-file snapshot stores, clear
  // stale lock and WAL temp files, then detect PG_VERSION and migrate or
  // warn. Under PH_FORCE_PG_VERSION the dirs are wiped instead.
  // One process per PGlite store, before anything (the pre-flight included)
  // touches it: hosts share one .ph tree, so a second `ph run …` / `ph vetra`
  // in the same project must fail here instead of tearing the store.
  if (!PGLITE_IN_MEMORY) acquireStoreLocks(pgliteDirs);
  warnIgnoredFlushInterval(logger);
  const detectedMajors = await runPglitePreflight({
    dirs: pgliteDirs,
    forcePgVersion: options.forcePgVersion,
    migratePglite: options.migratePglite,
    inMemory: PGLITE_IN_MEMORY,
    logger,
  });

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

  const inspectionThrottle = inspectionThrottleFromEnv(process.env);
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
    assertWorkerTrustPolicy({
      workers: workerPool.numWorkers,
      authEnforcement:
        resolveReactorFeatureFlags(process.env).flags.authEnforcement === true,
      renownSource: renownConfig.source,
    });
    if (!reactorDbUrl || !isPostgresUrl(reactorDbUrl)) {
      throw new Error(
        "The executor worker pool (REACTOR_WORKERS) requires a Postgres reactor database — set PH_REACTOR_DATABASE_URL or PH_SWITCHBOARD_DATABASE_URL. PGlite cannot be shared across worker threads.",
      );
    }
  }

  const unsupportedStoredDocuments = resolveUnsupportedStoredDocuments(
    options.unsupportedStoredDocuments,
    process.env,
  );

  let projectionWorker = resolveProjectionWorkerOptions(
    options.projectionWorker,
    process.env,
  );
  if (projectionWorker && options.reactor) {
    logger.warn(
      "Projection worker configuration ignored: the caller-provided reactor owns its own read-model coordinator",
    );
    projectionWorker = null;
  }
  if (projectionWorker) {
    assertProjectionWorkerSupported({ dev: dev === true, reactorDbUrl });
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
  const configPath = resolveConfigPath(options.configFile);
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

  // Registry packages import from the on-disk cache, which workers can read.
  const registryPackageNames = new Set(
    (registryPackages ?? "")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean),
  );
  const resolveRegistryModels = async (
    identifier: string,
  ): Promise<string | null> =>
    httpLoader && registryPackageNames.has(identifier)
      ? ((await httpLoader.cachePackage(identifier)).entries.documentModels ??
        null)
      : null;

  const reactorLogger = logger.child(["reactor"]);
  // Latched: dropWriteReady reports the fatal once per dropped job.
  let projectionWorkerFatalFired = false;
  const onProjectionWorkerFatal = (shardId: string, reason: Error) => {
    if (projectionWorkerFatalFired) {
      return;
    }
    projectionWorkerFatalFired = true;
    reactorLogger.error(
      `Projection worker ${shardId} died; shutting down so the supervisor restarts a healthy process`,
      reason,
    );
    // SIGTERM takes the builder's withSignalHandlers() path: kill, hooks, db.
    process.kill(process.pid, "SIGTERM");
  };
  // Resolved in startSwitchboard, which owns the flag mechanism; initServer
  // only reads the answer.
  const workflowsEnabled = options.workflows?.enabled === true;
  // Resolved before the reactor is built: a bad secret fails the boot early.
  // Flag-on, the privacy plugin owns this resolve (same fail-fast timing, in
  // transformServerOptions above).
  const privacyConfig = pluginHost
    ? ({ enabled: false } as ResolvedPrivacy)
    : resolvePrivacy(options.privacy, process.env);

  // Through the package manager like any other, so one route carries the
  // models, the subgraphs and the piece.
  if (workflowsEnabled) {
    await assertWorkflowPackageLoadable();
    if (!packages.includes(WORKFLOW_PACKAGE_NAME)) {
      packages.push(WORKFLOW_PACKAGE_NAME);
    }
  }

  // Set only when we build the reactor ourselves; a caller-provided one keeps
  // its own lifecycle and must not be torn down here.
  let ownedReactorModule: InProcessReactorClientModule | undefined;
  // The models workers and workflow pieces import; only on a reactor built here.
  let workerModels: ModelManifestSource | undefined;
  // Bound once the api serves the renown read model; see `localCredentialCheck`.
  let localRenownRequest: SwitchboardRequestFn | undefined;
  const initializeClient = async (
    documentModels: DocumentModelModule[],
    {
      attachmentReferenceWriter,
      upgradeManifests,
    }: ClientInitializerDependencies,
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

    const {
      kysely: baseKysely,
      poolInstrumentation,
      storageFacts,
    } = await createReactorKysely({
      reactorDbUrl,
      reactorPgliteDir,
      reactorPgliteMajor,
      inMemory: PGLITE_IN_MEMORY,
      hostPoolSize: () => resolveHostPoolSize(process.env),
      logger,
    });

    const maxSkipThreshold = parseInt(process.env.MAX_SKIP_THRESHOLD ?? "", 10);
    const hasSkipThreshold = !isNaN(maxSkipThreshold) && maxSkipThreshold > 0;
    if (hasSkipThreshold) {
      logger.info(`Reactor maxSkipThreshold set to ${maxSkipThreshold}`);
    }

    // Flip these per document-sharing fleet, never per node: replay decisions
    // are consensus outcomes, so nodes that disagree on the flags diverge.
    const { flags: reactorFeatureFlags, enabled: enabledFeatureFlags } =
      resolveReactorFeatureFlags(process.env);
    if (enabledFeatureFlags.length > 0) {
      logger.info(
        `Reactor feature flags enabled: ${enabledFeatureFlags.join(", ")}`,
      );
    }
    if (!reactorFeatureFlags.undoV3) {
      logger.info(
        "Reactor undoV3 is off (REACTOR_UNDO_V3=false): new documents take base-reducer 2",
      );
    }

    const reactorBuilder = new ReactorBuilder()
      .withEventBus(new EventBus())
      .withKysely(baseKysely)
      .withStorageFacts(storageFacts)
      .withFeatures({
        legacyProcessorIds:
          process.env.REACTOR_LEGACY_PROCESSOR_IDS !== "false",
      })
      .withUnsupportedStoredDocuments(unsupportedStoredDocuments);

    // Feeds `module.pools`, which ReactorInstrumentation reads to emit
    // reactor.db.pool.{acquire.wait_duration,size,idle,waiting}. Without this
    // the host pool is the one pool the reactor opens that nobody can see.
    // Note the gauges observe pg-pool only: behind a transaction-mode
    // pgbouncer, `waiting` can read 0 while requests queue in the pooler.
    if (poolInstrumentation) {
      reactorBuilder.withInstrumentedPool(poolInstrumentation);
    }

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
      signalHandlers: options.signalHandlers,
      documentModels: [...documentModels, ...vetraDocumentModels],
      upgradeManifests,
      executorConfig: {
        ...(hasSkipThreshold ? { maxSkipThreshold } : {}),
        featureFlags: reactorFeatureFlags,
      },
      documentModelLoader:
        httpLoader && dynamicModelLoading
          ? httpLoader.documentModelLoader
          : undefined,
      logger: reactorLogger,
      signer: renown
        ? getRenownSignerConfig(renown, options.identity?.keypairPath)
        : undefined,
      createSignaturePolicy: resolveCreateSignaturePolicy(process.env, {
        hasSigner: renown !== null,
        logger,
      }),
      trustPolicy: reactorFeatureFlags.authEnforcement
        ? await getRenownTrustPolicyConfig(
            renownConfig.source === "self"
              ? {
                  source: "self",
                  request: (query, variables) =>
                    localRenownRequest
                      ? localRenownRequest(query, variables)
                      : Promise.reject(
                          new Error(
                            "The local renown read model is not bound yet",
                          ),
                        ),
                }
              : {
                  source: "remote",
                  renownUrl: renownConfig.url,
                  switchboardUrl: renownConfig.switchboardUrl,
                },
            renown,
          )
        : undefined,
    });

    // File sources give workers and workflow pieces importable paths for the
    // models registered above; the builder dedupes them.
    if (workerPool || projectionWorker || workflowsEnabled) {
      const sources = await resolveWorkerModelSources(packages, reactorLogger, {
        resolveRemote: resolveRegistryModels,
      });
      // Workers need every model; workflow pieces can do without a broken one.
      reactorBuilder.withDocumentModelSources(
        workerPool || projectionWorker
          ? sources
          : await keepImportableSources(sources, reactorLogger),
      );
    }
    workerModels = modelManifestSource(reactorBuilder);

    if (workerPool) {
      if (!reactorDbUrl) {
        throw new Error(
          "unreachable: worker pool enabled without a reactor database URL",
        );
      }
      // The builder fails the boot if a model lacks an importable source.
      reactorBuilder.withWorkerPool({
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

    if (projectionWorker) {
      if (!reactorDbUrl) {
        throw new Error(
          "unreachable: projection worker enabled without a reactor database URL",
        );
      }
      const db = {
        ...buildWorkerDbConfig(reactorDbUrl, {
          dbPoolSizePerWorker: projectionWorker.dbPoolSize,
          acquireTimeoutMs: workerPool?.acquireTimeoutMs ?? 5000,
        }),
        applicationName: "switchboard-projection",
      };
      reactorBuilder.withReadModelCoordinatorFactory(
        createHybridProjectionCoordinatorFactory({
          shardCount: 1,
          poolSize: projectionWorker.dbPoolSize,
          db,
          onFatal: onProjectionWorkerFatal,
        }),
      );
      reactorLogger.info(
        `Projection worker enabled: 1 worker thread, pool size ${projectionWorker.dbPoolSize}`,
      );
    }

    reactorBuilder.withShutdownHook(async () => {
      if (apiRef.current) await apiRef.current.dispose();
    });

    let module: InProcessReactorClientModule;
    try {
      module = await clientBuilder.buildModule();
    } catch (error) {
      try {
        await baseKysely.destroy();
      } catch (destroyError) {
        logger.error(
          "Aborting boot: reactor database destroy failed: @error",
          destroyError,
        );
      }
      if (UnsupportedStoredProtocolError.isError(error)) {
        throw new StoredDocumentsRefusedError(error);
      }
      throw error;
    }

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

    ownedReactorModule = module;
    if (options.fatalErrorShutdown) {
      installFatalErrorShutdown(logger);
    }

    return {
      module,
      reactorDriveClient,
      attachmentReferenceProjection: { status: "available" as const },
    };
  };

  // Tear down a partially booted stack in the reactor's own order: reactor
  // first, then the api's HTTP/WS/db handles, then the database pool. An
  // owned reactor goes through its module's shutdown, so the other hooks run
  // too and a later signal joins this teardown instead of repeating it.
  const abortBoot = async (api: { dispose: () => Promise<void> }) => {
    let disposed: Promise<void> | undefined;
    const disposeApi = () => (disposed ??= api.dispose());
    apiRef.current = { dispose: disposeApi };
    const owned = ownedReactorModule;
    if (owned?.reactorModule) {
      try {
        await owned.reactorModule.shutdown();
      } catch (error) {
        logger.error("Aborting boot: reactor shutdown failed: @error", error);
      }
    } else if (owned) {
      try {
        await owned.reactor.kill().completed;
      } catch (error) {
        logger.error("Aborting boot: reactor shutdown failed: @error", error);
      }
    }
    // Already done by the shutdown hook unless the reactor failed to stop.
    try {
      await disposeApi();
    } catch (error) {
      logger.error("Aborting boot: api dispose failed: @error", error);
    }
  };

  // Reading credentials from this switchboard's own reactor needs the GraphQL
  // manager, which only exists once the api is up: bind the check afterwards.
  let localCredentialCheck: CredentialCheck | undefined;
  const verifyCredential: CredentialVerifier | undefined =
    renownConfig.source === "self"
      ? (params) =>
          localCredentialCheck
            ? localCredentialCheck(params)
            : Promise.reject(
                new Error("The local renown read model is not bound yet"),
              )
      : undefined;

  let defaultDriveUrl: undefined | string = undefined;

  // TODO get path from powerhouse config
  const basePath = process.cwd();

  const reportError = (error: unknown) => {
    Sentry.captureException(error);
  };
  const reporting = { logger, report: reportError };

  // import Vite loader only if dev mode is enabled
  let vite: ViteDevServer | undefined;
  let viteLoader: VitePackageLoader | undefined;
  if (dev) {
    const { VitePackageLoader, createViteLogger, startViteServer } =
      await import("@powerhousedao/reactor-api/vite");
    vite = await startViteServer(process.cwd(), createViteLogger(logger));
    // Packages switchboard brings, like the workflow package, resolve from
    // here when the project does not install them itself.
    viteLoader = VitePackageLoader.build(vite, {
      resolveFrom: [import.meta.url],
      reportError,
    });
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
    const durableFs = await loadDurableFsFactory(readModelPgliteMajor, logger);
    pgliteFactory = PGLITE_IN_MEMORY
      ? () => new ReadModelPGlite({ parsers: PGLITE_UTC_PARSERS })
      : (connectionString) =>
          new ReadModelPGlite({
            fs: durableFs(connectionString ?? readModelPgliteDir),
            parsers: PGLITE_UTC_PARSERS,
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
      configFile: configPath,
      mcp: options.mcp ?? true,
      inspection:
        options.inspection === false ? false : { throttle: inspectionThrottle },
      logger: apiLogger,
      reportError,
      enableDocumentModelSubgraphs: options.enableDocumentModelSubgraphs,
      // Already resolved for this reactor's own identity; reuse it so an
      // invalid RENOWN_SOURCE is reported once, not once per resolution.
      renown: renownConfig,
      verifyCredential,
    },
    "switchboard",
  );
  apiRef.current = api;

  if (renownConfig.source === "self") {
    const { graphqlManager: manager } = api;
    // Refuse to serve rather than 401 every request: the read model comes from
    // a loaded package, so a missing one is a deployment mistake.
    if (!manager.hasSubgraphHandler(RENOWN_READ_MODEL_SUBGRAPH)) {
      await abortBoot(api);
      throw new Error(
        'Renown credential verification is set to "self" (auth.renown.source ' +
          `or RENOWN_SOURCE) but no loaded package serves the ` +
          `"${RENOWN_READ_MODEL_SUBGRAPH}" subgraph. Install one ` +
          "(@powerhousedao/renown-package) or set RENOWN_SOURCE=remote.",
      );
    }
    localRenownRequest = (query, variables) =>
      manager.executeSubgraphQuery(
        RENOWN_READ_MODEL_SUBGRAPH,
        query,
        variables,
      );
    localCredentialCheck = createLocalCredentialVerifier(localRenownRequest, {
      onError: (error) =>
        logger.error("Renown read model query failed: @error", error),
    });
    logger.info(
      "Renown credentials will be verified against this switchboard's own " +
        "renown read model",
    );
  }

  // R2.3: flag-on, the attachments plugin owns the route mount + service
  // creation at onHttpMounting; flag-off runs the inline path.
  let attachmentService:
    | ReturnType<typeof createRemoteAttachmentService>
    | undefined;
  if (pluginHost) {
    pluginHost.ctx.api = api;
    pluginHost.ctx.serverPort = serverPort;
    await pluginHost.observe("onHttpMounting");
    attachmentService = pluginHost.ctx.attachmentService as
      | ReturnType<typeof createRemoteAttachmentService>
      | undefined;
  } else {
    registerAttachmentRoutes(api);
    attachmentService = createRemoteAttachmentService(
      deriveAttachmentServiceConfig(options, serverPort, renown),
    );
  }

  if (process.env.SENTRY_DSN) {
    // Register Sentry error handler after all routes are established.
    // The adapter calls the framework-specific Sentry setup internally.
    api.httpAdapter.setupSentryErrorHandler(Sentry);
  }

  const { client, graphqlManager, documentModelRegistry } = api;

  const lateSubgraphs: Promise<unknown>[] = [];
  if (pluginHost) {
    pluginHost.ctx.client = client;
    pluginHost.ctx.graphqlManager = graphqlManager;
    pluginHost.ctx.lateSubgraphs = lateSubgraphs;
    pluginHost.ctx.reactorClientModule = options.reactor ?? ownedReactorModule;
    await pluginHost.observe("onReactorReady");
  }

  // The workflow runtime is a switchboard component: composed from what the
  // api handed back, registered like any other late subgraph.
  let workflows: ComposedWorkflowRuntime | undefined;
  let workflowsRetry: WorkflowSingletonRetry | undefined;
  const composeWorkflows = () =>
    composeWorkflowRuntime({
      reactorClient: client,
      clientModule: options.reactor ?? ownedReactorModule,
      relationalDb: api.relationalDb,
      // A Postgres read model outlives the pod; a key file beside it would not.
      secretsKeyFile: readModelPgliteDir === null ? false : undefined,
      // The stable half of the default singleton owner name. Absolute, so
      // two Switchboards in different working directories differ.
      storageId:
        readModelPgliteDir === null
          ? readModelPath
          : path.resolve(readModelPath),
      attachments: createAttachmentClient(api.attachments.service),
      attachmentAccess: api.attachmentAccess,
      // The workflow package's own HTTP namespace: its webhook endpoints live
      // under it, not under the reactor's.
      webhooks: api.httpRoutes.scopeFor(WORKFLOW_PACKAGE_NAME).webhooks,
      http: api.httpRoutes.scopeFor(WORKFLOW_PACKAGE_NAME),
      authorizationService: api.authorizationService,
      // The manager that already loads this reactor's packages: the project it
      // runs in is one of them, so its own pieces arrive with the rest.
      pieces: api.packageManager,
      pieceRegistryUrl: registryUrl,
      models: workerModels,
      // The piece pool leaves the reactor's threads their share of the cores.
      reactorThreads:
        (workerPool?.numWorkers ?? 0) + (projectionWorker ? 1 : 0),
      logger: logger.child(["workflow-runtime"]),
      exclusiveJournal: readModelPgliteDir !== null,
      onSingletonLost: workflowSingletonLossHandler(logger),
      // The providers observability.mts registered before this module loaded.
      telemetry: {
        tracer: trace.getTracer(WORKFLOW_TELEMETRY_SCOPE),
        meter: metrics.getMeter(WORKFLOW_TELEMETRY_SCOPE),
      },
    });
  const registerWorkflowSubgraph = (composed: ComposedWorkflowRuntime) => {
    const WorkflowRuntimeSubgraph = composed.subgraph;
    const workflowSubgraph = new WorkflowRuntimeSubgraph({
      reactorClient: client,
      http: graphqlManager.scopeForPackage(WORKFLOW_PACKAGE_NAME),
      relationalDb: api.relationalDb,
      analyticsStore: undefined as never,
      graphqlManager,
      syncManager: api.syncManager,
      authorizationService: graphqlManager.getAuthorizationService(),
      path: graphqlManager.getBasePath(),
      attachments: api.attachmentClientProvider,
    });
    return graphqlManager
      .registerSubgraphInstance(workflowSubgraph, "graphql", false)
      .catch((error: unknown) => {
        reportFailure(
          reporting,
          error,
          "Failed to register workflow-runtime subgraph: @error",
        );
      });
  };
  if (!pluginHost && workflowsEnabled) {
    try {
      workflows = await composeWorkflows();
    } catch (error) {
      // Without the claim this host must not run workflows, but everything
      // else it serves still works, so it boots without the runtime.
      if (!isWorkflowSingletonConflict(error)) throw error;
      logger.warn(
        `Workflows are enabled but another live process ("${error.owner ?? "unknown"}") ` +
          `holds the workflow singleton until ${error.expiresAt ?? "unknown"}. ` +
          "This Switchboard has booted WITHOUT the workflow runtime: no " +
          "trigger of any kind fires here, and the workflow GraphQL face is " +
          "absent. Everything else serves normally. Stop the other owner, or " +
          "set PH_WORKFLOWS_SINGLETON_OWNER to the same stable name on the " +
          "slot that owns workflows. This Switchboard retries the claim and " +
          "starts workflows once the lease comes free.",
      );
      workflowsRetry = retryWorkflowSingleton({
        compose: composeWorkflows,
        onComposed: async (composed) => {
          try {
            await composed.start();
          } catch (error) {
            // Hands the lease back so a retry or another replica can claim it.
            try {
              await composed.stop();
            } catch (stopError) {
              logger.error(
                "Stopping the late workflow runtime failed: @error",
                stopError,
              );
            }
            throw error;
          }
          logger.info("Workflow runtime started");
          workflows = composed;
          await registerWorkflowSubgraph(composed);
          // Past boot nothing else rebuilds the router, so a subgraph
          // registered now is not served until this runs.
          try {
            await graphqlManager.updateRouter(true);
          } catch (error) {
            reportFailure(
              reporting,
              error,
              "Mounting the late workflow-runtime subgraph failed: @error",
            );
          }
        },
        logger,
      });
    }
  }
  if (workflows) {
    lateSubgraphs.push(registerWorkflowSubgraph(workflows));
    await workflows.start();
    logger.info("Workflow runtime started");
    api.inspection?.facts.setWorkflows(true);
  }

  // Plugins register their subgraphs here (push into lateSubgraphs, or mount
  // directly like privacy). The call site carries the inline privacy block's
  // failure semantics: stop workflows, abort the partial boot, rethrow.
  if (pluginHost) {
    pluginHost.ctx.workflowsOrchestration = {
      enabled: options.workflows?.enabled === true,
      composeWorkflows,
      registerWorkflowSubgraph,
      updateRouter: () => graphqlManager.updateRouter(true),
      reportMountFailure: (error: unknown) =>
        reportFailure(
          reporting,
          error,
          "Mounting the late workflow-runtime subgraph failed: @error",
        ),
      setWorkflowsFact: () => api.inspection?.facts.setWorkflows(true),
    };
    try {
      await pluginHost.observe("onSubgraphsRegistering");
    } catch (error) {
      await (
        pluginHost.ctx.workflowsRetry as WorkflowSingletonRetry | undefined
      )?.stop();
      await (
        pluginHost.ctx.workflows as ComposedWorkflowRuntime | undefined
      )?.stop();
      await abortBoot(api);
      throw error;
    }
  }

  let privacy: RunningPrivacy | undefined;
  if (!pluginHost && privacyConfig.enabled) {
    // The caller's reactor signs with a signer only the caller knows.
    const signer = options.reactor
      ? options.privacy?.signer
      : (options.privacy?.signer ?? renown?.signer);
    try {
      privacy = await startPrivacy({
        config: privacyConfig,
        reactorModule: (options.reactor ?? ownedReactorModule)?.reactorModule,
        signer,
        authorizationService: api.authorizationService,
        documentPermissionService: api.documentPermissionService,
        graphqlManager,
        reactorClient: client,
        logger: logger.child(["privacy"]),
      });
    } catch (error) {
      await workflowsRetry?.stop();
      await workflows?.stop();
      await abortBoot(api);
      throw error;
    }
  }

  // Ahead of the api: the runtime's store lives in the read-model database
  // that dispose closes, and its children outlive the reactor otherwise.
  // Memoized: the reactor's shutdown hook and a caller can both reach it.
  let apiDrained: Promise<void> | undefined;
  const drainApi = () =>
    (apiDrained ??= (async () => {
      if (pluginHost) await pluginHost.observe("onShutdown");
      await privacy?.stop();
      await workflowsRetry?.stop();
      await workflows?.stop();
      await api.dispose();
    })());
  apiRef.current = { dispose: drainApi };
  // An owned reactor's shutdown drains the api through the hook above, in the
  // signal path's order: kill, hooks, database. A caller's reactor is the
  // caller's to stop, so only the api is drained.
  const ownedReactor = ownedReactorModule?.reactorModule;
  const shutdown = ownedReactor ? () => ownedReactor.shutdown() : drainApi;

  // Wire up dynamic package management if HTTP loader is configured
  if (httpLoader) {
    const packageManagementService = new PackageManagementService({
      defaultRegistryUrl: registryUrl,
      httpLoader,
      documentModelRegistry,
      packageManager: api.packageManager,
    });

    packageManagementService.setOnModelsChanged(() => {
      graphqlManager
        .regenerateDocumentModelSubgraphs()
        .catch((error: unknown) => {
          reportFailure(
            reporting,
            error,
            "Failed to regenerate document model subgraphs: @error",
          );
        });
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
      http: graphqlManager.scopeForPackage("@powerhousedao/switchboard"),
      attachments: api.attachmentClientProvider,
    });

    lateSubgraphs.push(
      graphqlManager
        .registerSubgraphInstance(packagesSubgraph, "graphql", false)
        .catch((error: unknown) => {
          reportFailure(
            reporting,
            error,
            "Failed to register packages subgraph: @error",
          );
        }),
    );
  }

  if (driveNodeView) {
    graphqlManager.setAdditionalContextFields({
      readModel: driveNodeView,
    });

    const authorizationService = graphqlManager.getAuthorizationService();
    const reactorDriveSubgraph = {
      name: REACTOR_DRIVE_SUBGRAPH_NAME,
      path: graphqlManager.getBasePath(),
      resolvers: createReactorDriveResolvers({
        reactorClient: client,
        readModel: driveNodeView,
        hostCanRead: (documentId, address) =>
          authorizationService.canRead(
            documentId as CanonicalDocumentId,
            address,
          ),
      }),
      typeDefs: reactorDriveSubgraphTypeDefs,
      reactorClient: client,
      relationalDb: undefined as never,
    };

    lateSubgraphs.push(
      graphqlManager
        .registerSubgraphInstance(reactorDriveSubgraph, "graphql", false)
        .catch((error: unknown) => {
          reportFailure(
            reporting,
            error,
            "Failed to register reactor-drive subgraph: @error",
          );
        }),
    );
  }

  void runDetached(
    "Marking the API ready",
    async () => {
      await Promise.allSettled(lateSubgraphs);
      try {
        await graphqlManager.updateRouter(true);
      } catch (error) {
        reportFailure(
          reporting,
          error,
          "Final router update before readiness failed: @error",
        );
      }
      api.readiness.markReady();
    },
    reporting,
  );

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
        logger,
      );
    } else {
      defaultDriveUrl = await addDefaultDrive(
        client,
        options.drive,
        serverPort,
        logger,
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

  // Drives exist (default created, remotes attached) — the barrier after the
  // future core drive seeding (R2 step 2 replaces the two blocks above).
  if (pluginHost) await pluginHost.observe("onDrivesReady");

  return {
    defaultDriveUrl,
    api,
    reactor: client,
    attachmentService,
    attachmentReferenceProjection: api.attachmentReferenceProjection,
    // Read live: losing the singleton turns it unavailable.
    get workflowTriggers() {
      return (
        workflows ??
        (pluginHost?.ctx.workflows as ComposedWorkflowRuntime | undefined)
      )?.triggers;
    },
    workflowsEnabled,
    modelManifest: () => workerModels?.modelManifest() ?? [],
    privacy: (() => {
      const running =
        privacy ?? (pluginHost?.ctx.privacy as RunningPrivacy | undefined);
      return running ? { erasure: running.erasure } : undefined;
    })(),
    mcpEnabled: options.mcp !== false,
    inspectionEnabled: options.inspection !== false,
    renown,
    port: serverPort,
    shutdown,
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
 * reactor. `shutdown()` on the returned handle then runs the reactor
 * module's `shutdown()`: `kill()`, the `withShutdownHook` chain that drains
 * the api (HTTP server, GraphQL, MCP, attachments, read-model db), then the
 * reactor database. It does not exit the process. It is the same memoized
 * teardown the SIGINT/SIGTERM handlers (`withSignalHandlers`) run, so calling
 * it twice, or receiving a signal around it, tears down once.
 */
export const startSwitchboard = async (
  options: StartServerOptions = {},
): Promise<SwitchboardReactor> => {
  const requestedPort = options.port ?? DEFAULT_PORT;
  const logger = options.logger ?? defaultLogger;
  // Here as well as in index.mts, so a host embedding the server is profiled.
  if (process.env.PYROSCOPE_SERVER_ADDRESS) {
    await initProfilerFromEnv(process.env).catch((error: unknown) =>
      logger.error("Error starting profiler: @error", error),
    );
  }
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

  // CLASSIC resolution of the carved subsystems' switches — flag-on, the
  // plugins own these (presence is activation): the resolvers are skipped so
  // an ABSENT plugin can actually deactivate its subsystem (initServer
  // normalizes unset values to off after transformServerOptions). An explicit
  // caller option always wins on both paths. The inspection flag is a core
  // capability (not carved) and resolves classically either way.
  if (!isPluginHostEnabled()) {
    options.mcp = await resolveMcpEnabled({
      featureFlags,
      option: options.mcp,
    });
    const configPathForFlags = resolveConfigPath(options.configFile);
    const workflowsEnabled = await resolveWorkflowsEnabled({
      featureFlags,
      override: options.workflows?.enabled,
      configEnabled: readConfigWorkflowsEnabled(configPathForFlags),
    });
    options.workflows = { enabled: workflowsEnabled };
  }
  options.inspection = await resolveInspectionEnabled({
    featureFlags,
    option: options.inspection,
  });
  // This switchboard's own identity authenticates against the same Renown
  // instance it verifies incoming credentials against, unless told otherwise.
  const renownConfig = resolveRenownConfig(
    getConfig(resolveConfigPath(options.configFile)).auth?.renown,
    process.env,
    logger,
  );
  options.identity = {
    ...options.identity,
    baseUrl: options.identity?.baseUrl ?? renownConfig.url,
    // Under a shell's PH_USER_DATA_DIR the identity lives in the user's .ph
    // tree with the stores, never in the install dir. Unset: unchanged —
    // renown's own `<cwd>/.ph/.keypair.json` default applies.
    keypairPath:
      options.identity?.keypairPath ??
      (process.env.PH_USER_DATA_DIR
        ? path.join(resolvePhDir(), ".keypair.json")
        : undefined),
  };

  logger.info(
    "Feature flags: @flags",
    JSON.stringify(
      {
        DOCUMENT_MODEL_SUBGRAPHS_ENABLED: enableDocumentModelSubgraphs,
        MCP_ENABLED: options.mcp,
        INSPECTION_ENABLED: options.inspection,
        PH_WORKFLOWS_ENABLED: options.workflows?.enabled,
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
    return await initServer(serverPort, options, renown, renownConfig);
  } catch (e) {
    Sentry.captureException(e);
    if (StoredDocumentsRefusedError.isError(e)) {
      logger.error(e.message);
    } else {
      logger.error("App crashed: @error", e);
    }
    throw e;
  }
};

export {
  applySwitchboardReactorDefaults,
  type SwitchboardReactorDefaultsOptions,
} from "./builder-defaults.mjs";
export * from "./types.js";
export {
  StoredDocumentsRefusedError,
  resolveUnsupportedStoredDocuments,
} from "./unsupported-stored-documents.mjs";

if (import.meta.main) {
  await startSwitchboard({ fatalErrorShutdown: true });
}
