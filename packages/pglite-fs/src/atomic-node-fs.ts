import { MemoryFS, protocol } from "@electric-sql/pglite";
import { promises as fs } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import path from "node:path";

// PGDATA in PGLite 0.3.x's MEMFS layout. The compiled bundle uses
// `/tmp/pglite/base` (PG install prefix `/tmp/pglite`, data dir `base/` inside
// it). Not exported as a runtime constant, so we hardcode.
const PGDATA = "/tmp/pglite/base";
const SNAPSHOT_NAME = "snapshot.bin";
const SNAPSHOT_TMP = "snapshot.bin.tmp";
const MAGIC = new Uint8Array([0x50, 0x47, 0x4c, 0x41]); // "PGLA"
const FORMAT_VERSION = 1;
const HEADER_SIZE = 12;
const ENTRY_PREFIX_SIZE = 9;
// Node rejects a single read or write above 2^31-1 bytes.
const DEFAULT_IO_CHUNK_SIZE = 64 * 1024 * 1024;
const DEFAULT_MAINTENANCE_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_VACUUM_FULL_ABOVE_BYTES = 256 * 1024 * 1024;
const MAINTENANCE_RETRY_MS = 1000;
let ioChunkSize = DEFAULT_IO_CHUNK_SIZE;

export function setIoChunkSizeForTests(size?: number): void {
  ioChunkSize = size ?? DEFAULT_IO_CHUNK_SIZE;
}

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
   * crash durability for sustained throughput: a crash loses every write
   * since the last completed snapshot, which is up to `flushIntervalMs` plus
   * the duration of the snapshot in flight (a full-tree write, so it grows
   * with the database). `closeFs` always drains pending writes durably before
   * returning; a process that exits without calling it gets no final flush.
   *
   * Default `0` preserves the original per-call synchronous behavior.
   */
  flushIntervalMs?: number;
  /**
   * Called on every failed snapshot write, in either mode. While the last
   * write has failed, each `syncToFs` retries synchronously and rejects if the
   * retry fails too; the first successful write clears the failure.
   */
  onFlushError?: (error: unknown) => void;
  /**
   * PGLite has no autovacuum and never checkpoints on WAL size, so dead
   * tuples and WAL grow without bound. Every `maintenanceIntervalMs`, if
   * anything was synced since the last pass and no transaction is open, run
   * VACUUM then CHECKPOINT and flush the snapshot. Default 5 minutes; `0`
   * disables.
   */
  maintenanceIntervalMs?: number;
  /**
   * When the snapshot loaded at startup is larger than this, the first
   * maintenance pass runs VACUUM FULL instead of VACUUM to reclaim existing
   * bloat. It holds the database for roughly 2s per GB and needs transient
   * memory about the size of the live data. Default 256MB; `0` disables.
   */
  vacuumFullAboveBytes?: number;
}

type MaintenanceOutcome =
  | "vacuum"
  | "vacuum-full"
  | "idle"
  | "not-ready"
  | "in-transaction"
  | "failed";

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
  private readonly onFlushError?: (error: unknown) => void;
  private readonly maintenanceIntervalMs: number;
  private readonly vacuumFullAboveBytes: number;

  private dirty = false;
  private failed = false;
  private flushTimer?: ReturnType<typeof setTimeout>;
  private flushInFlight?: Promise<void>;
  private writing?: Promise<void>;

  private closing = false;
  private syncsSinceMaintenance = 0;
  private vacuumFullPending = false;
  private maintenanceTimer?: ReturnType<typeof setTimeout>;
  private maintenanceInFlight?: Promise<MaintenanceOutcome>;

  constructor(
    hostDir: string,
    optionsOrLogger?: AtomicNodeFsOptions | AtomicNodeFsLogger,
  ) {
    super();
    this.hostDir = path.resolve(hostDir);
    const options = normalizeOptions(optionsOrLogger);
    this.logger = options.logger;
    this.flushIntervalMs = Math.max(0, options.flushIntervalMs ?? 0);
    this.onFlushError = options.onFlushError;
    this.maintenanceIntervalMs = Math.max(
      0,
      options.maintenanceIntervalMs ?? DEFAULT_MAINTENANCE_INTERVAL_MS,
    );
    this.vacuumFullAboveBytes = Math.max(
      0,
      options.vacuumFullAboveBytes ?? DEFAULT_VACUUM_FULL_ABOVE_BYTES,
    );
  }

  async initialSyncFs(): Promise<void> {
    await this.loadSnapshot();
    this.scheduleMaintenance(this.maintenanceIntervalMs);
  }

  private async loadSnapshot(): Promise<void> {
    await fs.mkdir(this.hostDir, { recursive: true });
    const snapPath = path.join(this.hostDir, SNAPSHOT_NAME);
    const tmpPath = path.join(this.hostDir, SNAPSHOT_TMP);

    // Drop any leftover staging file from a prior crashed write.
    await fs.rm(tmpPath, { force: true });

    const memFs = this.pg!.Module.FS as MemFs;

    if (await fileExists(snapPath)) {
      const fh = await fs.open(snapPath, "r");
      try {
        const { size } = await fh.stat();
        await restoreMemfs(memFs, PGDATA, fh, size);
        this.vacuumFullPending =
          this.vacuumFullAboveBytes > 0 && size > this.vacuumFullAboveBytes;
      } finally {
        await fh.close();
      }
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
    this.syncsSinceMaintenance++;
    await this.persist(relaxedDurability ?? false);
  }

  async closeFs(): Promise<void> {
    try {
      this.closing = true;
      this.cancelMaintenance();
      await this.maintenanceInFlight;
      this.cancelDeferredFlush();
      await this.drainInFlight();
      this.dirty = false;
      await this.flush(false);
    } finally {
      await super.closeFs();
    }
  }

  private async persist(relaxedDurability: boolean): Promise<void> {
    if (this.flushIntervalMs === 0) {
      await this.flush(relaxedDurability);
      return;
    }
    this.dirty = true;
    if (!this.failed) {
      this.scheduleDeferredFlush(relaxedDurability);
      return;
    }
    this.cancelDeferredFlush();
    await this.drainInFlight();
    this.dirty = false;
    await this.flush(relaxedDurability);
  }

  private scheduleMaintenance(delayMs: number): void {
    if (this.maintenanceIntervalMs === 0 || this.closing) return;
    this.maintenanceTimer = setTimeout(() => {
      this.maintenanceTimer = undefined;
      this.maintenanceInFlight = this.runMaintenance()
        .then((outcome) => {
          this.scheduleMaintenance(
            outcome === "in-transaction"
              ? Math.min(MAINTENANCE_RETRY_MS, this.maintenanceIntervalMs)
              : this.maintenanceIntervalMs,
          );
          return outcome;
        })
        .finally(() => {
          this.maintenanceInFlight = undefined;
        });
    }, delayMs);
    this.maintenanceTimer.unref();
  }

  private cancelMaintenance(): void {
    if (!this.maintenanceTimer) return;
    clearTimeout(this.maintenanceTimer);
    this.maintenanceTimer = undefined;
  }

  private async runMaintenance(): Promise<MaintenanceOutcome> {
    const pg = this.pg;
    if (this.closing || !pg?.ready) return "not-ready";
    // pg.close() does not take the query mutex; recheck before each statement.
    const isReady = (): boolean => pg.ready;
    if (this.syncsSinceMaintenance === 0 && !this.vacuumFullPending) {
      return "idle";
    }
    const full = this.vacuumFullPending;
    let outcome: MaintenanceOutcome;
    try {
      outcome = await pg._runExclusiveQuery(async () => {
        // VACUUM inside an open transaction aborts it. isInTransaction()
        // misses START TRANSACTION; ReadyForQuery status does not.
        if (!isReady()) return "not-ready";
        const { messages } = await pg.execProtocol(
          protocol.serialize.query(""),
          {
            syncToFs: false,
          },
        );
        if (transactionStatus(messages) !== "I") return "in-transaction";
        if (full) {
          this.logger?.warn(
            `AtomicNodeFs: snapshot at ${this.hostDir} exceeds ${this.vacuumFullAboveBytes} bytes; running VACUUM FULL`,
          );
        }
        for (const statement of [
          full ? "VACUUM FULL" : "VACUUM",
          "CHECKPOINT",
        ]) {
          if (!isReady()) return "not-ready";
          await pg.execProtocol(protocol.serialize.query(statement), {
            syncToFs: false,
          });
        }
        return full ? "vacuum-full" : "vacuum";
      });
    } catch (err) {
      this.logger?.warn(
        `AtomicNodeFs maintenance failed: ${errorMessage(err)}`,
      );
      return "failed";
    }
    if (outcome !== "vacuum" && outcome !== "vacuum-full") return outcome;
    this.syncsSinceMaintenance = 0;
    this.vacuumFullPending = false;
    try {
      await this.persist(false);
    } catch (err) {
      this.logger?.warn(
        `AtomicNodeFs flush after maintenance failed: ${errorMessage(err)}`,
      );
      return "failed";
    }
    return outcome;
  }

  private cancelDeferredFlush(): void {
    if (!this.flushTimer) return;
    clearTimeout(this.flushTimer);
    this.flushTimer = undefined;
  }

  private async drainInFlight(): Promise<void> {
    while (this.flushInFlight) {
      await this.flushInFlight;
    }
  }

  private async flush(relaxedDurability: boolean): Promise<void> {
    while (this.writing) await this.writing;
    const write = this.writeSnapshot(relaxedDurability);
    this.writing = write
      .then(
        () => undefined,
        () => undefined,
      )
      .finally(() => {
        this.writing = undefined;
      });
    try {
      await write;
    } catch (err) {
      this.failed = true;
      this.reportFlushError(err);
      throw err;
    }
    this.failed = false;
  }

  private reportFlushError(err: unknown): void {
    if (!this.onFlushError) return;
    try {
      this.onFlushError(err);
    } catch (callbackErr) {
      this.logger?.warn(
        `AtomicNodeFs onFlushError callback threw: ${errorMessage(callbackErr)}`,
      );
    }
  }

  private scheduleDeferredFlush(relaxedDurability: boolean): void {
    if (this.flushTimer || this.flushInFlight) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined;
      this.flushInFlight = this.drainDirty(relaxedDurability)
        .catch((err: unknown) => {
          this.logger?.warn(
            `AtomicNodeFs deferred flush failed: ${errorMessage(err)}`,
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
      try {
        await this.flush(relaxedDurability);
      } catch (err) {
        this.dirty = true;
        throw err;
      }
    }
  }

  private async writeSnapshot(relaxedDurability: boolean): Promise<void> {
    const memFs = this.pg!.Module.FS as MemFs;
    const entries = collectEntries(memFs, PGDATA);
    const snapPath = path.join(this.hostDir, SNAPSHOT_NAME);
    const tmpPath = path.join(this.hostDir, SNAPSHOT_TMP);

    const fh = await fs.open(tmpPath, "w");
    try {
      await writeEntries(fh, entries);
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
    "warn" in value && typeof (value as AtomicNodeFsLogger).warn === "function"
  );
}

function transactionStatus(messages: readonly { name: string }[]): unknown {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.name === "readyForQuery") return (m as { status?: unknown }).status;
  }
  return undefined;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
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

export function collectEntries(FS: MemFs, root: string): Entry[] {
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

  return entries;
}

type WriteHandle = Pick<FileHandle, "write">;
type ReadHandle = Pick<FileHandle, "read">;

export async function writeEntries(
  fh: WriteHandle,
  entries: Entry[],
): Promise<void> {
  const encoder = new TextEncoder();
  const encodedPaths = entries.map((e) => encoder.encode(e.relPath));

  let size = HEADER_SIZE;
  for (let i = 0; i < entries.length; i++) {
    size += ENTRY_PREFIX_SIZE + encodedPaths[i].byteLength + 4;
    size += entries[i].data?.byteLength ?? 0;
  }

  const writer = new ChunkedWriter(fh, Math.min(ioChunkSize, size));

  const header = Buffer.allocUnsafe(HEADER_SIZE);
  header.set(MAGIC, 0);
  header.writeUInt32LE(FORMAT_VERSION, 4);
  header.writeUInt32LE(entries.length, 8);
  await writer.append(header);

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const pathBytes = encodedPaths[i];
    const dataLen = e.data?.byteLength ?? 0;
    const prefix = Buffer.allocUnsafe(
      ENTRY_PREFIX_SIZE + pathBytes.byteLength + 4,
    );
    prefix.writeUInt8(e.type, 0);
    prefix.writeUInt32LE(e.mode, 1);
    prefix.writeUInt32LE(pathBytes.byteLength, 5);
    prefix.set(pathBytes, ENTRY_PREFIX_SIZE);
    prefix.writeUInt32LE(dataLen, ENTRY_PREFIX_SIZE + pathBytes.byteLength);
    await writer.append(prefix);
    if (dataLen > 0 && e.data) await writer.append(e.data);
  }

  await writer.flush();
}

class ChunkedWriter {
  private readonly buf: Buffer;
  private used = 0;
  private position = 0;

  constructor(
    private readonly fh: WriteHandle,
    chunkSize: number,
  ) {
    this.buf = Buffer.allocUnsafe(Math.max(1, chunkSize));
  }

  async append(bytes: Uint8Array): Promise<void> {
    const size = this.buf.byteLength;
    let off = 0;
    while (off < bytes.byteLength) {
      if (this.used === 0 && bytes.byteLength - off >= size) {
        await this.writeAll(bytes.subarray(off, off + size));
        off += size;
        continue;
      }
      const n = Math.min(size - this.used, bytes.byteLength - off);
      this.buf.set(bytes.subarray(off, off + n), this.used);
      this.used += n;
      off += n;
      if (this.used === size) await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.used === 0) return;
    await this.writeAll(this.buf.subarray(0, this.used));
    this.used = 0;
  }

  private async writeAll(bytes: Uint8Array): Promise<void> {
    let off = 0;
    while (off < bytes.byteLength) {
      const { bytesWritten } = await this.fh.write(
        bytes,
        off,
        bytes.byteLength - off,
        this.position,
      );
      if (bytesWritten <= 0) {
        throw new Error("AtomicNodeFs: snapshot write made no progress");
      }
      off += bytesWritten;
      this.position += bytesWritten;
    }
  }
}

class ChunkedReader {
  private readonly buf: Buffer;
  private start = 0;
  private end = 0;
  private position = 0;

  constructor(
    private readonly fh: ReadHandle,
    chunkSize: number,
  ) {
    this.buf = Buffer.allocUnsafe(Math.max(1, chunkSize));
  }

  async take(n: number): Promise<Buffer> {
    const out = Buffer.allocUnsafe(n);
    let filled = 0;
    while (filled < n) {
      if (this.start === this.end) {
        if (n - filled >= this.buf.byteLength) {
          filled += await this.readInto(out, filled, n - filled);
          continue;
        }
        this.start = 0;
        this.end = await this.readInto(this.buf, 0, this.buf.byteLength);
      }
      const k = Math.min(this.end - this.start, n - filled);
      this.buf.copy(out, filled, this.start, this.start + k);
      this.start += k;
      filled += k;
    }
    return out;
  }

  private async readInto(
    target: Buffer,
    offset: number,
    length: number,
  ): Promise<number> {
    const { bytesRead } = await this.fh.read(
      target,
      offset,
      Math.min(length, this.buf.byteLength),
      this.position,
    );
    if (bytesRead <= 0) {
      throw new Error("AtomicNodeFs: truncated snapshot");
    }
    this.position += bytesRead;
    return bytesRead;
  }
}

export async function restoreMemfs(
  FS: MemFs,
  root: string,
  fh: ReadHandle,
  fileSize: number,
): Promise<void> {
  ensureDir(FS, root);

  const reader = new ChunkedReader(fh, Math.min(ioChunkSize, fileSize));

  const header = await reader.take(HEADER_SIZE);
  for (let i = 0; i < 4; i++) {
    if (header[i] !== MAGIC[i]) {
      throw new Error("AtomicNodeFs: invalid snapshot magic");
    }
  }

  const version = header.readUInt32LE(4);
  if (version !== FORMAT_VERSION) {
    throw new Error(`AtomicNodeFs: unsupported snapshot version ${version}`);
  }
  const count = header.readUInt32LE(8);

  const decoder = new TextDecoder();

  for (let i = 0; i < count; i++) {
    const prefix = await reader.take(ENTRY_PREFIX_SIZE);
    const type = prefix.readUInt8(0);
    const mode = prefix.readUInt32LE(1);
    const pathLen = prefix.readUInt32LE(5);
    const relPath = decoder.decode(await reader.take(pathLen));
    const dataLen = (await reader.take(4)).readUInt32LE(0);
    const data = await reader.take(dataLen);
    const full = root + "/" + relPath;

    if (type === 0) {
      // dirMode: a snapshot written right after a Windows migration can carry
      // execute-less directory modes, which would make it unopenable.
      if (!FS.analyzePath(full).exists) FS.mkdir(full, dirMode(mode));
      else FS.chmod(full, dirMode(mode));
    } else {
      FS.writeFile(full, data);
      FS.chmod(full, mode);
    }
  }
}

/**
 * Permission bits for a directory created in MEMFS.
 *
 * Windows has no execute bit, so `fs.stat` reports every directory as 0o40666.
 * Copying that mode verbatim produces a MEMFS directory that cannot be
 * traversed, and every lookup beneath it fails with ENOENT -- which surfaces
 * as PGLite throwing a bare `ErrnoError { errno: 2 }` on the first query after
 * a legacy migration. Force the traverse bit on. MEMFS is process-local and
 * rebuilt from disk on every open, so host permissions carry no meaning here.
 */
function dirMode(mode: number): number {
  return (mode & 0o7777) | 0o111;
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
          FS.mkdir(memFull, dirMode(stat.mode));
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
