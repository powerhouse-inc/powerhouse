// Test-only v1 snapshot.bin writer over a loose on-disk tree.
import { promises as fs } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import path from "node:path";

const MAGIC = new Uint8Array([0x50, 0x47, 0x4c, 0x41]);
const FORMAT_VERSION = 1;
const HEADER_SIZE = 12;
const ENTRY_PREFIX_SIZE = 9;
const DEFAULT_SKIP = ["snapshot.bin", "snapshot.bin.tmp"];

export interface SnapshotEntry {
  type: 0 | 1;
  mode: number;
  relPath: string;
  data?: Buffer;
}

export interface WriteSnapshotOptions {
  /** Root-level names to leave out. Defaults to the snapshot files. */
  skip?: string[];
}

export async function collectDiskEntries(
  dataDir: string,
  options: WriteSnapshotOptions = {},
): Promise<SnapshotEntry[]> {
  const skip = new Set(options.skip ?? DEFAULT_SKIP);
  const entries: SnapshotEntry[] = [];
  const walk = async (dir: string, rel: string) => {
    const names = (await fs.readdir(dir)).sort();
    for (const name of names) {
      if (rel === "" && skip.has(name)) continue;
      const full = path.join(dir, name);
      const relPath = rel === "" ? name : `${rel}/${name}`;
      const stat = await fs.lstat(full);
      if (stat.isDirectory()) {
        entries.push({ type: 0, mode: stat.mode & 0o7777, relPath });
        await walk(full, relPath);
      } else if (stat.isFile()) {
        entries.push({
          type: 1,
          mode: stat.mode & 0o7777,
          relPath,
          data: await fs.readFile(full),
        });
      }
    }
  };
  await walk(dataDir, "");
  return entries;
}

export function encodeSnapshot(entries: SnapshotEntry[]): Buffer {
  const encoder = new TextEncoder();
  const parts: Buffer[] = [];
  const header = Buffer.alloc(HEADER_SIZE);
  header.set(MAGIC, 0);
  header.writeUInt32LE(FORMAT_VERSION, 4);
  header.writeUInt32LE(entries.length, 8);
  parts.push(header);
  for (const entry of entries) {
    const pathBytes = encoder.encode(entry.relPath);
    const dataLen = entry.data?.byteLength ?? 0;
    const prefix = Buffer.alloc(ENTRY_PREFIX_SIZE + pathBytes.byteLength + 4);
    prefix.writeUInt8(entry.type, 0);
    prefix.writeUInt32LE(entry.mode, 1);
    prefix.writeUInt32LE(pathBytes.byteLength, 5);
    prefix.set(pathBytes, ENTRY_PREFIX_SIZE);
    prefix.writeUInt32LE(dataLen, ENTRY_PREFIX_SIZE + pathBytes.byteLength);
    parts.push(prefix);
    if (entry.data && dataLen > 0) parts.push(entry.data);
  }
  return Buffer.concat(parts);
}

/** Serializes `dataDir` into `snapshotPath`. Returns the entry count and size. */
export async function writeSnapshotFromDir(
  dataDir: string,
  snapshotPath: string,
  options: WriteSnapshotOptions = {},
): Promise<{ entries: number; bytes: number }> {
  const entries = await collectDiskEntries(dataDir, options);
  const bytes = encodeSnapshot(entries);
  let fh: FileHandle | undefined;
  try {
    fh = await fs.open(snapshotPath, "w");
    await fh.writeFile(bytes);
    await fh.sync();
  } finally {
    await fh?.close();
  }
  return { entries: entries.length, bytes: bytes.byteLength };
}
