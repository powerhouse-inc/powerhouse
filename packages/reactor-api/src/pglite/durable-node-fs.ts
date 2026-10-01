import type { PGlite } from "@electric-sql/pglite";
import { ERRNO_CODES } from "@electric-sql/pglite/basefs";
import type { NodeFS } from "@electric-sql/pglite/nodefs";
import nodeFs from "node:fs";
import path from "node:path";
import { dirBytes, PgliteMaintenance } from "./maintenance.js";

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
  logger?: { warn(message: string): void };
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

interface NodeFsStream {
  nfd?: number;
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
    logger,
  });

  class Durable extends Base {
    readonly maintenance = maintenance;
    private mod?: EmscriptenMod;

    async init(
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

    async initialSyncFs(): Promise<void> {
      await super.initialSyncFs();
      const baseBytes = await dirBytes(path.join(resolvedDir, "base"));
      maintenance.start(this.pg!, resolvedDir, baseBytes);
    }

    async syncToFs(relaxedDurability?: boolean): Promise<void> {
      maintenance.noteSync();
      await super.syncToFs(relaxedDurability);
    }

    async closeFs(): Promise<void> {
      try {
        await maintenance.stop();
      } finally {
        await super.closeFs();
      }
    }

    // WASI fd_sync convention: 0 or a positive errno.
    private fsyncStream(stream: NodeFsStream): number {
      // Directory streams carry no host fd; only regular files do.
      if (typeof stream.nfd !== "number") return 0;
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
      let stream: NodeFsStream;
      try {
        stream = this.mod!.FS.getStreamChecked(fd);
      } catch {
        return -ERRNO_CODES.EBADF;
      }
      if (typeof stream.nfd !== "number") return 0;
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
