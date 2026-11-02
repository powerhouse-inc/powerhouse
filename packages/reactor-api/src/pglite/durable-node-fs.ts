import type { PGlite } from "@electric-sql/pglite";
import { ERRNO_CODES } from "@electric-sql/pglite/basefs";
import type { NodeFS } from "@electric-sql/pglite/nodefs";
import nodeFs from "node:fs";
import path from "node:path";
import {
  dirBytes,
  FORCED_VACUUM_FULL_MAX_DEFER_MS,
  PgliteMaintenance,
  type MaintenanceGate,
} from "./maintenance.js";
import { syncTree } from "./sync-tree.js";

export type NodeFsClass = typeof NodeFS;

// Emscripten/WASI errno; the basefs ERRNO_CODES export lacks it.
const EIO = 29;

export interface DurableNodeFsOptions {
  /** Default true; `PH_PGLITE_FSYNC=0` turns it off (power-loss durability off). */
  fsync?: boolean;
  /** Default 5 min; 0 disables. */
  maintenanceIntervalMs?: number;
  /** `base/` size at open; default 256 MB; 0 disables. */
  vacuumFullAboveBytes?: number;
  /** See `MaintenanceOptions.vacuumFullQuietMs`; default 60 s. */
  vacuumFullQuietMs?: number;
  /** See `MaintenanceOptions.vacuumFullMaxDeferMs`; default 0 (quiet window only). */
  vacuumFullMaxDeferMs?: number;
  /** See `MaintenanceOptions.gate`. */
  maintenanceGate?: MaintenanceGate;
  /** The gap between statements a table rewrite waits for. Default 1 s. */
  rewriteQuietMs?: number;
  /** How long a table rewrite waits for that gap. Default 15 min. */
  rewriteMaxWaitMs?: number;
  /** Clock for the maintenance quiet window; tests pass their own. */
  now?: () => number;
  logger?: { warn(message: string): void; info?(message: string): void };
  /** Emscripten abort (a Postgres PANIC, e.g. ENOSPC on WAL). */
  onAbort?: (what: unknown) => void;
  hostFs?: Pick<typeof nodeFs, "fsyncSync" | "fdatasyncSync">;
}

export type DurableNodeFs = InstanceType<NodeFsClass> & {
  readonly maintenance: PgliteMaintenance;
};

export function resolvePgliteFsync(
  env: Record<string, string | undefined>,
): boolean {
  return env.PH_PGLITE_FSYNC !== "0";
}

/** `PH_PGLITE_VACUUM_FULL`: when an oversized store's one-time VACUUM FULL may run. */
export type PgliteVacuumFullMode = "off" | "quiet" | "forced";

const VACUUM_FULL_MODES: readonly PgliteVacuumFullMode[] = [
  "off",
  "quiet",
  "forced",
];

/** The VACUUM FULL settings an environment selects; see {@link resolvePgliteMaintenance}. */
export type PgliteMaintenanceSettings = Pick<
  DurableNodeFsOptions,
  "vacuumFullAboveBytes" | "vacuumFullQuietMs" | "vacuumFullMaxDeferMs"
>;

/**
 * Reads the VACUUM FULL knobs. `PH_PGLITE_VACUUM_FULL` is `off` (the
 * default: never), `quiet` (only after the quiet window, however long that
 * takes) or `forced` (a deadline of 30 min from open, after which it runs
 * under load). Off is the default because a full rewrite of a large store
 * needs about twice its size in free disk and holds the only connection for
 * minutes, and on a store that is live data rather than bloat it reclaims
 * nothing; a quiet window of a minute arrives naturally between jobs, so
 * `quiet` is an opt-in for stores known to be small or bloated.
 * `PH_PGLITE_VACUUM_FULL_ABOVE_MB` sets the size that makes a store
 * eligible; `PH_PGLITE_VACUUM_FULL_QUIET_MS` and
 * `PH_PGLITE_VACUUM_FULL_MAX_DEFER_MS` override the mode's timings. A value
 * that is not a non-negative number is left to the default; an unknown mode
 * throws, since silently running a rewrite is what this guards against.
 */
export function resolvePgliteMaintenance(
  env: Record<string, string | undefined>,
): PgliteMaintenanceSettings {
  const rawMode = env.PH_PGLITE_VACUUM_FULL?.trim().toLowerCase() || "off";
  if (!isVacuumFullMode(rawMode)) {
    throw new Error(
      `Invalid PH_PGLITE_VACUUM_FULL: ${String(env.PH_PGLITE_VACUUM_FULL)}. Expected "off", "quiet" or "forced".`,
    );
  }
  const mode: PgliteVacuumFullMode = rawMode;
  const settings: PgliteMaintenanceSettings = {};
  if (mode === "off") settings.vacuumFullAboveBytes = 0;
  if (mode === "forced") {
    settings.vacuumFullMaxDeferMs = FORCED_VACUUM_FULL_MAX_DEFER_MS;
  }
  const aboveMb = nonNegative(env.PH_PGLITE_VACUUM_FULL_ABOVE_MB);
  if (aboveMb !== undefined && mode !== "off") {
    settings.vacuumFullAboveBytes = aboveMb * 1024 * 1024;
  }
  const quiet = nonNegative(env.PH_PGLITE_VACUUM_FULL_QUIET_MS);
  if (quiet !== undefined) settings.vacuumFullQuietMs = quiet;
  const maxDefer = nonNegative(env.PH_PGLITE_VACUUM_FULL_MAX_DEFER_MS);
  if (maxDefer !== undefined) settings.vacuumFullMaxDeferMs = maxDefer;
  return settings;
}

function isVacuumFullMode(value: string): value is PgliteVacuumFullMode {
  return (VACUUM_FULL_MODES as readonly string[]).includes(value);
}

function nonNegative(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

interface NodeFsStream {
  nfd?: number;
  /** Emscripten open flags; NODEFS opens the host fd with the same access mode. */
  flags?: number;
}

// Only PGlite's pg_flush_data (fsync on pre_sync_fname's O_RDONLY fd) syncs a
// read-only fd: the result is discarded and an O_RDWR fsync of the same file
// follows. Skipped, as Windows refuses FlushFileBuffers without write access.
function isReadOnly(stream: NodeFsStream): boolean {
  return stream.flags !== undefined && (stream.flags & 3) === 0;
}

interface EmscriptenFs {
  filesystems: { NODEFS: { stream_ops: Record<string, unknown> } };
  getStreamChecked(fd: number): NodeFsStream;
  quit(): void;
}

interface EmscriptenMod {
  FS: EmscriptenFs;
  [wasmExport: string]: unknown;
}

// PGlite re-enters wasm from its own error handler after a query fails; on an
// aborted runtime that spins forever, so every entry point is cut off first.
const WASM_ENTRY_POINTS = [
  "_interactive_one",
  "_interactive_write",
  "_pgl_backend",
  "_pgl_initdb",
  "_pgl_shutdown",
];

function poisonAfterAbort(mod: EmscriptenMod | undefined, what: unknown): void {
  if (!mod) return;
  const message = `PGlite aborted: ${String(what) || "wasm runtime abort"}`;
  for (const name of WASM_ENTRY_POINTS) {
    if (typeof mod[name] !== "function") continue;
    mod[name] = () => {
      throw new Error(message);
    };
  }
  // pg.close() rejects before closeFs(), so release the host fds here.
  try {
    mod.FS.quit();
  } catch {
    // already quit by an earlier abort
  }
}

type SyscallImport = ((fd: number) => number) & { sig?: string };

interface WasmImports {
  env: Record<string, unknown> & { __syscall_fdatasync?: SyscallImport };
}

type InstantiateWasm = (
  imports: WasmImports,
  done: (instance: WebAssembly.Instance, module: WebAssembly.Module) => void,
) => unknown;

interface EmscriptenOpts {
  preRun?: ((mod: EmscriptenMod) => void)[];
  instantiateWasm?: InstantiateWasm;
  onAbort?: (what: unknown) => void;
}

type InitOpts = Parameters<InstanceType<NodeFsClass>["init"]>[1];

/** Built over the passed-in class so PG16 dirs on `pglite-legacy-02` get the same behaviour. */
export function createDurableNodeFs(
  Base: NodeFsClass,
  dataDir: string,
  options: DurableNodeFsOptions = {},
): DurableNodeFs {
  const fsync = options.fsync ?? true;
  const hostFs = options.hostFs ?? nodeFs;
  const logger = options.logger;
  const onAbort = options.onAbort;
  const resolvedDir = path.resolve(dataDir);
  const maintenance = new PgliteMaintenance({
    intervalMs: options.maintenanceIntervalMs,
    vacuumFullAboveBytes: options.vacuumFullAboveBytes,
    vacuumFullQuietMs: options.vacuumFullQuietMs,
    vacuumFullMaxDeferMs: options.vacuumFullMaxDeferMs,
    gate: options.maintenanceGate,
    now: options.now,
    rewriteQuietMs: options.rewriteQuietMs,
    rewriteMaxWaitMs: options.rewriteMaxWaitMs,
    logger,
  });

  class Durable extends Base {
    readonly maintenance = maintenance;
    private mod?: EmscriptenMod;
    // Off from initialSyncFs of a fresh dir until PGlite's first syncToFs.
    private hostSyncs = fsync;
    private freshInit = false;

    override async init(
      pg: PGlite,
      opts: InitOpts,
    ): Promise<{ emscriptenOpts: InitOpts }> {
      const { emscriptenOpts: base } = await super.init(pg, opts);
      const baseOpts = base as EmscriptenOpts;
      const inner = baseOpts.instantiateWasm;
      if (fsync && !inner) {
        throw new Error("PGlite did not supply instantiateWasm");
      }
      const emscriptenOpts: EmscriptenOpts = {
        ...baseOpts,
        onAbort: (what) => {
          poisonAfterAbort(this.mod, what);
          void maintenance.stop();
          onAbort?.(what);
        },
        preRun: [
          ...(baseOpts.preRun ?? []),
          (mod) => {
            this.mod = mod;
            if (!fsync) return;
            mod.FS.filesystems.NODEFS.stream_ops.fsync = (
              stream: NodeFsStream,
            ) => this.fsyncStream(stream);
          },
        ],
        instantiateWasm:
          fsync && inner
            ? (imports, done) => {
                const original = imports.env.__syscall_fdatasync;
                const replacement: SyscallImport = (fd) => this.fdatasync(fd);
                replacement.sig = original?.sig;
                imports.env.__syscall_fdatasync = replacement;
                return inner(imports, done);
              }
            : inner,
      };
      return { emscriptenOpts: emscriptenOpts as InitOpts };
    }

    override async initialSyncFs(): Promise<void> {
      await super.initialSyncFs();
      // No PG_VERSION: initdb runs next; PGlite calls syncToFs once before ready.
      this.freshInit =
        fsync && !nodeFs.existsSync(path.join(resolvedDir, "PG_VERSION"));
      if (this.freshInit) this.hostSyncs = false;
      const baseBytes = await dirBytes(path.join(resolvedDir, "base"));
      maintenance.start(this.pg!, resolvedDir, baseBytes);
    }

    override async syncToFs(relaxedDurability?: boolean): Promise<void> {
      maintenance.noteSync();
      await super.syncToFs(relaxedDurability);
      if (!this.freshInit) return;
      this.freshInit = false;
      this.hostSyncs = true;
      syncTree(resolvedDir, hostFs);
    }

    override async closeFs(): Promise<void> {
      try {
        await maintenance.stop();
      } finally {
        await super.closeFs();
      }
    }

    // WASI fd_sync convention: 0 or a positive errno.
    private fsyncStream(stream: NodeFsStream): number {
      if (!this.hostSyncs) return 0;
      // Directory streams carry no host fd; only regular files do.
      if (typeof stream.nfd !== "number" || isReadOnly(stream)) return 0;
      try {
        hostFs.fsyncSync(stream.nfd);
      } catch (err) {
        logger?.warn(`DurableNodeFs fsync failed: ${String(err)}`);
        return EIO;
      }
      return 0;
    }

    // Linux syscall convention: 0 or a negative errno.
    private fdatasync(fd: number): number {
      if (!this.hostSyncs) return 0;
      let stream: NodeFsStream;
      try {
        stream = this.mod!.FS.getStreamChecked(fd);
      } catch {
        return -ERRNO_CODES.EBADF;
      }
      if (typeof stream.nfd !== "number" || isReadOnly(stream)) return 0;
      try {
        hostFs.fdatasyncSync(stream.nfd);
      } catch (err) {
        logger?.warn(`DurableNodeFs fdatasync failed: ${String(err)}`);
        return -EIO;
      }
      return 0;
    }
  }

  return new Durable(dataDir) as DurableNodeFs;
}
