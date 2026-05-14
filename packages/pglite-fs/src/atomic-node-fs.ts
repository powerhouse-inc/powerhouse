import { MemoryFS } from "@electric-sql/pglite";
import { promises as fs } from "node:fs";
import path from "node:path";

// PGDATA in PGLite 0.3.x's MEMFS layout. The compiled bundle uses
// `/tmp/pglite/base` (PG install prefix `/tmp/pglite`, data dir `base/` inside
// it). Not exported as a runtime constant, so we hardcode.
const PGDATA = "/tmp/pglite/base";
const SNAPSHOT_NAME = "snapshot.bin";
const SNAPSHOT_TMP = "snapshot.bin.tmp";
const MAGIC = new Uint8Array([0x50, 0x47, 0x4c, 0x41]); // "PGLA"
const FORMAT_VERSION = 1;

type EntryType = 0 | 1; // 0=dir, 1=file

interface MemFs {
  readdir(path: string): string[];
  stat(path: string): { mode: number; size: number };
  readFile(path: string, opts?: { encoding: "binary" }): Uint8Array;
  writeFile(path: string, data: Uint8Array): void;
  mkdir(path: string, mode?: number): void;
  chmod(path: string, mode: number): void;
  analyzePath(path: string): { exists: boolean };
  isDir(mode: number): boolean;
  isFile(mode: number): boolean;
}

export interface AtomicNodeFsLogger {
  warn(message: string): void;
}

export interface AtomicNodeFsOptions {
  logger?: AtomicNodeFsLogger;
  /**
   * Coalesce `syncToFs` calls into a trailing-edge disk write at most every
   * `flushIntervalMs` milliseconds. PGLite calls `syncToFs` after every
   * non-transactional query (including each BEGIN/INSERT/COMMIT emitted by
   * Kysely), so a synchronous full-tree snapshot per call caps write
   * throughput at one query per snapshot duration. Deferred mode trades
   * worst-case crash loss of up to `flushIntervalMs` of writes for sustained
   * throughput. `closeFs` always drains pending writes durably before
   * returning.
   *
   * Default `0` preserves the original per-call synchronous behavior.
   */
  flushIntervalMs?: number;
}

/**
 * PGLite Filesystem that holds the working data dir in Emscripten MEMFS and
 * atomically swaps a single-file on-disk snapshot on `syncToFs`. A SIGKILL
 * mid-write leaves the previous snapshot intact, so the next startup loads
 * cleanly rather than aborting on torn WAL.
 *
 * Intended for local dev use — full-tree snapshots are fine at dev volume but
 * won't scale to production write rates. For write-heavy workloads, pass
 * `flushIntervalMs` to coalesce multiple PGLite syncs into one disk write.
 */
export class AtomicNodeFs extends MemoryFS {
  private readonly hostDir: string;
  private readonly logger?: AtomicNodeFsLogger;
  private readonly flushIntervalMs: number;

  private dirty = false;
  private flushTimer?: ReturnType<typeof setTimeout>;
  private flushInFlight?: Promise<void>;

  constructor(
    hostDir: string,
    optionsOrLogger?: AtomicNodeFsOptions | AtomicNodeFsLogger,
  ) {
    super();
    this.hostDir = path.resolve(hostDir);
    const options = normalizeOptions(optionsOrLogger);
    this.logger = options.logger;
    this.flushIntervalMs = Math.max(0, options.flushIntervalMs ?? 0);
  }

  async initialSyncFs(): Promise<void> {
    await fs.mkdir(this.hostDir, { recursive: true });
    const snapPath = path.join(this.hostDir, SNAPSHOT_NAME);
    const tmpPath = path.join(this.hostDir, SNAPSHOT_TMP);

    // Drop any leftover staging file from a prior crashed write.
    await fs.rm(tmpPath, { force: true });

    const memFs = this.pg!.Module.FS as MemFs;

    if (await fileExists(snapPath)) {
      const bytes = await fs.readFile(snapPath);
      restoreMemfs(memFs, PGDATA, bytes);
      return;
    }

    const legacyMarker = path.join(this.hostDir, "PG_VERSION");
    if (await fileExists(legacyMarker)) {
      this.logger?.warn(
        `Migrating legacy PGLite data dir at ${this.hostDir} to atomic snapshot. Original files retained alongside snapshot.bin as a backup; remove them once the new snapshot is verified.`,
      );
      await loadLegacyIntoMemfs(memFs, PGDATA, this.hostDir);
      return;
    }
  }

  async syncToFs(relaxedDurability?: boolean): Promise<void> {
    if (this.flushIntervalMs === 0) {
      await this.writeSnapshot(relaxedDurability ?? false);
      return;
    }
    this.dirty = true;
    this.scheduleDeferredFlush(relaxedDurability ?? false);
  }

  async closeFs(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
    while (this.flushInFlight) {
      await this.flushInFlight;
    }
    this.dirty = false;
    await this.writeSnapshot(false);
    await super.closeFs();
  }

  private scheduleDeferredFlush(relaxedDurability: boolean): void {
    if (this.flushTimer || this.flushInFlight) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined;
      this.flushInFlight = this.drainDirty(relaxedDurability)
        .catch((err) => {
          this.logger?.warn(
            `AtomicNodeFs deferred flush failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        })
        .finally(() => {
          this.flushInFlight = undefined;
        });
    }, this.flushIntervalMs);
    // Don't keep the event loop alive solely for a pending flush; closeFs is
    // responsible for draining before shutdown.
    this.flushTimer.unref?.();
  }

  private async drainDirty(relaxedDurability: boolean): Promise<void> {
    while (this.dirty) {
      this.dirty = false;
      await this.writeSnapshot(relaxedDurability);
    }
  }

  private async writeSnapshot(relaxedDurability: boolean): Promise<void> {
    const memFs = this.pg!.Module.FS as MemFs;
    const bytes = serializeMemfs(memFs, PGDATA);
    const snapPath = path.join(this.hostDir, SNAPSHOT_NAME);
    const tmpPath = path.join(this.hostDir, SNAPSHOT_TMP);

    const fh = await fs.open(tmpPath, "w");
    try {
      await fh.write(bytes);
      if (!relaxedDurability) await fh.sync();
    } finally {
      await fh.close();
    }

    await fs.rename(tmpPath, snapPath);

    if (!relaxedDurability) {
      try {
        const dirFh = await fs.open(this.hostDir, "r");
        try {
          await dirFh.sync();
        } finally {
          await dirFh.close();
        }
      } catch {
        // Some platforms reject fsync on a directory fd. The rename itself is
        // still atomic at the inode level; durability of the directory entry
        // is best-effort.
      }
    }
  }
}

function normalizeOptions(
  optionsOrLogger: AtomicNodeFsOptions | AtomicNodeFsLogger | undefined,
): AtomicNodeFsOptions {
  if (!optionsOrLogger) return {};
  if (isLogger(optionsOrLogger)) {
    return { logger: optionsOrLogger };
  }
  return optionsOrLogger;
}

function isLogger(
  value: AtomicNodeFsOptions | AtomicNodeFsLogger,
): value is AtomicNodeFsLogger {
  return (
    "warn" in value &&
    typeof (value as AtomicNodeFsLogger).warn === "function"
  );
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

function ensureDir(FS: MemFs, dir: string): void {
  const parts = dir.split("/").filter(Boolean);
  let cur = "";
  for (const p of parts) {
    cur += "/" + p;
    if (!FS.analyzePath(cur).exists) FS.mkdir(cur);
  }
}

interface Entry {
  type: EntryType;
  mode: number;
  relPath: string;
  data?: Uint8Array;
}

function serializeMemfs(FS: MemFs, root: string): Uint8Array {
  const entries: Entry[] = [];

  const walk = (dir: string, rel: string) => {
    const names = FS.readdir(dir);
    for (const name of names) {
      if (name === "." || name === "..") continue;
      const full = dir + "/" + name;
      const r = rel === "" ? name : rel + "/" + name;
      const stat = FS.stat(full);
      if (FS.isDir(stat.mode)) {
        entries.push({ type: 0, mode: stat.mode & 0o7777, relPath: r });
        walk(full, r);
      } else if (FS.isFile(stat.mode)) {
        const data = FS.readFile(full, { encoding: "binary" });
        entries.push({
          type: 1,
          mode: stat.mode & 0o7777,
          relPath: r,
          data,
        });
      }
      // skip symlinks, sockets, etc. — PGLite doesn't create them in PGDATA.
    }
  };
  walk(root, "");

  const encoder = new TextEncoder();
  const encodedPaths = entries.map((e) => encoder.encode(e.relPath));

  let size = 4 + 4 + 4; // magic + version + count
  for (let i = 0; i < entries.length; i++) {
    size += 1 + 4 + 4 + encodedPaths[i].byteLength + 4;
    size += entries[i].data?.byteLength ?? 0;
  }

  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  let off = 0;

  out.set(MAGIC, off);
  off += 4;
  view.setUint32(off, FORMAT_VERSION, true);
  off += 4;
  view.setUint32(off, entries.length, true);
  off += 4;

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const pathBytes = encodedPaths[i];
    view.setUint8(off, e.type);
    off += 1;
    view.setUint32(off, e.mode, true);
    off += 4;
    view.setUint32(off, pathBytes.byteLength, true);
    off += 4;
    out.set(pathBytes, off);
    off += pathBytes.byteLength;
    const dataLen = e.data?.byteLength ?? 0;
    view.setUint32(off, dataLen, true);
    off += 4;
    if (dataLen > 0 && e.data) {
      out.set(e.data, off);
      off += dataLen;
    }
  }

  return out;
}

function restoreMemfs(FS: MemFs, root: string, bytes: Uint8Array): void {
  ensureDir(FS, root);

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let off = 0;

  for (let i = 0; i < 4; i++) {
    if (bytes[off + i] !== MAGIC[i]) {
      throw new Error("AtomicNodeFs: invalid snapshot magic");
    }
  }
  off += 4;

  const version = view.getUint32(off, true);
  off += 4;
  if (version !== FORMAT_VERSION) {
    throw new Error(`AtomicNodeFs: unsupported snapshot version ${version}`);
  }
  const count = view.getUint32(off, true);
  off += 4;

  const decoder = new TextDecoder();

  for (let i = 0; i < count; i++) {
    const type = view.getUint8(off);
    off += 1;
    const mode = view.getUint32(off, true);
    off += 4;
    const pathLen = view.getUint32(off, true);
    off += 4;
    const relPath = decoder.decode(bytes.subarray(off, off + pathLen));
    off += pathLen;
    const dataLen = view.getUint32(off, true);
    off += 4;
    const full = root + "/" + relPath;

    if (type === 0) {
      if (!FS.analyzePath(full).exists) FS.mkdir(full, mode);
      else FS.chmod(full, mode);
    } else {
      const data = bytes.subarray(off, off + dataLen);
      FS.writeFile(full, data);
      FS.chmod(full, mode);
    }
    off += dataLen;
  }
}

async function loadLegacyIntoMemfs(
  FS: MemFs,
  root: string,
  hostDir: string,
): Promise<void> {
  ensureDir(FS, root);

  const skip = new Set([SNAPSHOT_NAME, SNAPSHOT_TMP, "postmaster.pid"]);

  const walk = async (diskPath: string, memPath: string) => {
    const ents = await fs.readdir(diskPath, { withFileTypes: true });
    for (const ent of ents) {
      if (skip.has(ent.name)) continue;
      const diskFull = path.join(diskPath, ent.name);
      const memFull = memPath + "/" + ent.name;
      const stat = await fs.stat(diskFull);
      if (ent.isDirectory()) {
        if (!FS.analyzePath(memFull).exists) {
          FS.mkdir(memFull, stat.mode & 0o7777);
        }
        await walk(diskFull, memFull);
      } else if (ent.isFile()) {
        const data = await fs.readFile(diskFull);
        FS.writeFile(memFull, data);
        FS.chmod(memFull, stat.mode & 0o7777);
      }
    }
  };

  await walk(hostDir, root);
}
