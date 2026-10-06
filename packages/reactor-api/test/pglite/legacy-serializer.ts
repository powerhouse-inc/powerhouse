// Frozen copy of the pre-streaming serializer. Tests compare the streaming
// writer against it byte for byte; do not edit.

const MAGIC = new Uint8Array([0x50, 0x47, 0x4c, 0x41]);
const FORMAT_VERSION = 1;

type EntryType = 0 | 1;

export interface LegacyMemFs {
  readdir(path: string): string[];
  stat(path: string): { mode: number; size: number };
  readFile(path: string, opts?: { encoding: "binary" }): Uint8Array;
  isDir(mode: number): boolean;
  isFile(mode: number): boolean;
}

interface Entry {
  type: EntryType;
  mode: number;
  relPath: string;
  data?: Uint8Array;
}

export function legacySerializeMemfs(
  FS: LegacyMemFs,
  root: string,
): Uint8Array {
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
