import { promises as fs } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import path from "node:path";
import { syncTree, type SyncTreeHostFs } from "./sync-tree.js";

// v1: magic, u32 version, u32 count; then u8 type, u32 mode, path, u32 len, data.
export const SNAPSHOT_FILE_NAME = "snapshot.bin";
const MAGIC = new Uint8Array([0x50, 0x47, 0x4c, 0x41]);
const FORMAT_VERSION = 1;
const HEADER_SIZE = 12;
const ENTRY_PREFIX_SIZE = 9;
const SKIPPED_ENTRIES = new Set(["postmaster.pid"]);
// Node rejects a single read above 2^31-1 bytes.
const DEFAULT_IO_CHUNK_SIZE = 64 * 1024 * 1024;

export interface ExtractSnapshotOptions {
  chunkSize?: number;
  /** Default true: one fsync pass over the tree after the last write. */
  sync?: boolean;
  hostFs?: SyncTreeHostFs;
}

export interface ExtractedSnapshot {
  pgVersionMajor: number;
  /** `global/pg_control` bytes; absent only in synthetic trees. */
  pgControl?: Buffer;
  /** Entries written to disk; skipped entries are not counted. */
  entries: number;
  /** Size of the snapshot file. */
  bytes: number;
}

/** Unpacks a snapshot into the existing `outDir`. */
export async function extractSnapshot(
  snapshotPath: string,
  outDir: string,
  options: ExtractSnapshotOptions = {},
): Promise<ExtractedSnapshot> {
  const fh = await fs.open(snapshotPath, "r");
  try {
    const { size } = await fh.stat();
    return await extractFromHandle(fh, size, outDir, options);
  } finally {
    await fh.close();
  }
}

async function extractFromHandle(
  fh: FileHandle,
  fileSize: number,
  outDir: string,
  options: ExtractSnapshotOptions,
): Promise<ExtractedSnapshot> {
  const root = path.resolve(outDir);
  const chunkSize = Math.min(
    options.chunkSize ?? DEFAULT_IO_CHUNK_SIZE,
    Math.max(1, fileSize),
  );
  const reader = new ChunkedReader(fh, chunkSize);

  const header = await reader.take(HEADER_SIZE);
  for (let i = 0; i < MAGIC.length; i++) {
    if (header[i] !== MAGIC[i]) {
      throw new Error("snapshot.bin: invalid snapshot magic");
    }
  }
  const version = header.readUInt32LE(4);
  if (version !== FORMAT_VERSION) {
    throw new Error(`snapshot.bin: unsupported snapshot version ${version}`);
  }
  const count = header.readUInt32LE(8);

  const decoder = new TextDecoder();
  let pgVersionText: string | undefined;
  let pgControl: Buffer | undefined;
  let written = 0;

  for (let i = 0; i < count; i++) {
    const prefix = await reader.take(ENTRY_PREFIX_SIZE);
    const type = prefix.readUInt8(0);
    const mode = prefix.readUInt32LE(1) & 0o7777;
    const pathLen = prefix.readUInt32LE(5);
    const relPath = decoder.decode(await reader.take(pathLen));
    const dataLen = (await reader.take(4)).readUInt32LE(0);
    const data = await reader.take(dataLen);

    const full = resolveInside(root, relPath);
    if (SKIPPED_ENTRIES.has(relPath)) continue;

    if (type === 0) {
      await fs.mkdir(full, { recursive: true });
      await fs.chmod(full, dirMode(mode));
    } else if (type === 1) {
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, data);
      await fs.chmod(full, mode);
      if (relPath === "PG_VERSION") pgVersionText = data.toString("utf8");
      if (relPath === "global/pg_control") pgControl = data;
    } else {
      throw new Error(`snapshot.bin: unknown entry type ${type}`);
    }
    written++;
  }

  if (pgVersionText === undefined) {
    throw new Error("snapshot.bin: no PG_VERSION entry");
  }
  const pgVersionMajor = Number.parseInt(pgVersionText.trim(), 10);
  if (!Number.isInteger(pgVersionMajor) || pgVersionMajor <= 0) {
    throw new Error(
      `snapshot.bin: unreadable PG_VERSION ${JSON.stringify(pgVersionText)}`,
    );
  }

  if (options.sync ?? true) syncTree(root, options.hostFs);

  return { pgVersionMajor, pgControl, entries: written, bytes: fileSize };
}

function resolveInside(root: string, relPath: string): string {
  const full = path.resolve(root, relPath);
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error(`snapshot.bin: entry escapes the data dir: ${relPath}`);
  }
  return full;
}

/** NTFS has no execute bit; a Windows snapshot can carry untraversable dirs. */
export function dirMode(mode: number): number {
  return (mode & 0o7777) | 0o111;
}

class ChunkedReader {
  private readonly buf: Buffer;
  private start = 0;
  private end = 0;
  private position = 0;

  constructor(
    private readonly fh: Pick<FileHandle, "read">,
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
      throw new Error("snapshot.bin: truncated snapshot");
    }
    this.position += bytesRead;
    return bytesRead;
  }
}
