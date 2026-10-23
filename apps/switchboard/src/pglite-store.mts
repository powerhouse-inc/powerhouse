import type { PGliteOptions } from "@electric-sql/pglite";
import {
  createDurableNodeFs,
  PGLITE_UTC_PARSERS,
  pgliteWorkerEntryPath,
  resolvePgliteFsync,
  resolvePgliteWorkerMemoryMb,
  ThreadedPGlite,
  type DurableNodeFs,
  type PGliteAbortListener,
  type PGliteExitListener,
  type PGliteLike,
  type PGliteParserPreset,
} from "@powerhousedao/reactor-api/pglite-node";
import type { HardenedPGliteDialectOptions } from "@powerhousedao/reactor";
import type { ILogger } from "document-model";
import { triggerFatalShutdown } from "./fatal-shutdown.mjs";
import {
  loadNodeFsClass,
  loadPGliteModule,
  pgliteModuleSpec,
  type SupportedPgMajor,
} from "./pglite-version.js";
import type { BooleanFlagSource } from "./workflow-runtime.mjs";

type FatalProcess = Parameters<typeof triggerFatalShutdown>[2];

/** The env var and OpenFeature flag key that moves each PGlite store into its own worker thread. */
export const PH_PGLITE_WORKERS = "PH_PGLITE_WORKERS";

/** Whether PGlite stores run in worker threads when neither the host nor PH_PGLITE_WORKERS says. */
export const PGLITE_WORKERS_DEFAULT = false;

export interface PgliteWorkersFlagInput {
  featureFlags: BooleanFlagSource;
  /** The host's `pgliteWorkers` option; wins either way. */
  option?: boolean;
}

/** Whether each PGlite store opens in its own worker thread: the host's
 * option, else PH_PGLITE_WORKERS ("true"/"false"), else PGLITE_WORKERS_DEFAULT. */
export async function resolvePgliteWorkersEnabled({
  featureFlags,
  option,
}: PgliteWorkersFlagInput): Promise<boolean> {
  if (option !== undefined) return option;
  return featureFlags.getBooleanValue(
    PH_PGLITE_WORKERS,
    PGLITE_WORKERS_DEFAULT,
  );
}

// A Postgres PANIC (ENOSPC on WAL, a failed fdatasync) aborts the wasm
// runtime; the store is dead and the process must not keep accepting writes.
export function onPgliteAbort(
  logger: ILogger,
  what: unknown,
  proc?: FatalProcess,
): void {
  if (!triggerFatalShutdown("PGlite aborted", what, proc)) {
    logger.error("PGlite aborted: @error", what);
  }
}

/** A store's worker thread died: every later query would fail, so the process shuts down. */
export function onPgliteWorkerExit(
  logger: ILogger,
  error: Error,
  proc?: FatalProcess,
): void {
  if (!triggerFatalShutdown("PGlite worker exited", error, proc)) {
    logger.error("PGlite worker exited: @error", error);
  }
}

/** The events a worker-backed store raises; {@link ThreadedPGlite} has them. */
export interface PgliteWorkerEvents {
  onAbort(listener: PGliteAbortListener): () => void;
  onExit(listener: PGliteExitListener): () => void;
}

/** Sends a worker's abort and its unexpected exit to the fatal shutdown. */
export function routePgliteWorkerFailures(
  store: PgliteWorkerEvents,
  logger: ILogger,
  proc?: FatalProcess,
): void {
  store.onAbort((reason) => onPgliteAbort(logger, reason, proc));
  store.onExit((error) => {
    if (error !== null) onPgliteWorkerExit(logger, error, proc);
  });
}

/** A store whose thread can be stopped at once. */
export interface TerminableStore {
  terminate(): Promise<void>;
}

/**
 * Adds a terminate of the store's worker to the dialect's `onPoisoned`: a
 * statement that never settled holds the worker's only connection, and the
 * fatal shutdown's close would otherwise queue behind it until its grace ran
 * out.
 */
export function terminateOnPoisoned(
  options: Partial<HardenedPGliteDialectOptions>,
  store: TerminableStore,
): Partial<HardenedPGliteDialectOptions> {
  const reportPoisoned = options.onPoisoned;
  return {
    ...options,
    onPoisoned: (cause) => {
      reportPoisoned?.(cause);
      void store.terminate();
    },
  };
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
export async function loadDurableFsFactory(
  major: SupportedPgMajor,
  logger: ILogger,
  proc?: FatalProcess,
): Promise<(dir: string) => DurableNodeFs> {
  const NodeFS = await loadNodeFsClass(major);
  return (dir) =>
    createDurableNodeFs(NodeFS, dir, {
      fsync: pgliteFsyncFor(major, dir, logger),
      logger,
      onAbort: (what) => onPgliteAbort(logger, what, proc),
    });
}

export type PgliteStoreLabel = "reactor-storage" | "read-storage";

export interface PgliteStoreOptions {
  label: PgliteStoreLabel;
  major: SupportedPgMajor;
  parsers: PGliteParserPreset;
  /** PH_PGLITE_IN_MEMORY: the store ignores its dir. */
  inMemory: boolean;
  /** Open the store in its own worker thread (PH_PGLITE_WORKERS / `pgliteWorkers`). */
  threaded: boolean;
  logger: ILogger;
  /** Where fatal conditions go; the process by default. */
  proc?: FatalProcess;
}

/** Opens a store on a data dir; synchronous because reactor-api's read store opens synchronously. */
export type PgliteStoreFactory = (dataDir: string) => PGliteLike;

/**
 * The factory for one PGlite store: in a worker thread when `threaded` (and a
 * worker script exists here), else in the main thread as before. Either way
 * the store runs DurableNodeFs over its dir with the same fsync choice, and a
 * wasm abort takes the fatal shutdown.
 */
export async function createPgliteStoreFactory(
  options: PgliteStoreOptions,
): Promise<PgliteStoreFactory> {
  if (options.threaded) {
    if (pgliteWorkerEntryPath !== null) return threadedStoreFactory(options);
    options.logger.warn(
      `${options.label}: no PGlite worker script is available (unbuilt @powerhousedao/reactor-api); PGlite runs in the main thread`,
    );
  }
  return mainThreadStoreFactory(options);
}

function threadedStoreFactory(options: PgliteStoreOptions): PgliteStoreFactory {
  const { label, major, parsers, inMemory, logger, proc } = options;
  const memoryLimitMb = resolvePgliteWorkerMemoryMb(process.env);
  const module = pgliteModuleSpec(major);
  return (dir) => {
    const store = new ThreadedPGlite({
      store: {
        label,
        dataDir: inMemory ? null : dir,
        module,
        durableFs: inMemory
          ? null
          : { fsync: pgliteFsyncFor(major, dir, logger) },
        parsers,
      },
      memoryLimitMb,
      logger,
    });
    routePgliteWorkerFailures(store, logger, proc);
    logger.info(
      `${label}: PGlite (PG${major}) in a worker thread (memory limit ${memoryLimitMb} MB)${where(inMemory, dir)}`,
    );
    return store;
  };
}

async function mainThreadStoreFactory(
  options: PgliteStoreOptions,
): Promise<PgliteStoreFactory> {
  const { label, major, inMemory, logger, proc } = options;
  const { PGlite } = await loadPGliteModule(major);
  const durableFs = inMemory
    ? null
    : await loadDurableFsFactory(major, logger, proc);
  const base: PGliteOptions =
    options.parsers === "utc-timestamps" ? { parsers: PGLITE_UTC_PARSERS } : {};
  return (dir) => {
    logger.info(
      `${label}: PGlite (PG${major}) in the main thread${where(inMemory, dir)}`,
    );
    return durableFs === null
      ? new PGlite(base)
      : new PGlite({ ...base, fs: durableFs(dir) });
  };
}

function where(inMemory: boolean, dir: string): string {
  return inMemory ? ", in memory [PH_PGLITE_IN_MEMORY=1]" : ` at ${dir}`;
}
