import { promises as fs, readdirSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { dirMode, extractSnapshot } from "../../src/pglite/snapshot-reader.js";
import { legacySerializeMemfs, type LegacyMemFs } from "./legacy-serializer.js";
import {
  collectDiskEntries,
  encodeSnapshot,
  writeSnapshotFromDir,
} from "./snapshot-writer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, "fixtures", "deterministic-tree.v1.bin");
const POSIX = process.platform !== "win32";
const RM = { recursive: true, force: true, maxRetries: 10 } as const;

interface DiskNode {
  type: "dir" | "file";
  mode: number;
  data?: Buffer;
}

async function walkTree(root: string): Promise<Map<string, DiskNode>> {
  const out = new Map<string, DiskNode>();
  const walk = async (dir: string, rel: string) => {
    for (const name of (await fs.readdir(dir)).sort()) {
      const full = path.join(dir, name);
      const relPath = rel === "" ? name : `${rel}/${name}`;
      const stat = await fs.lstat(full);
      if (stat.isDirectory()) {
        out.set(relPath, { type: "dir", mode: stat.mode & 0o7777 });
        await walk(full, relPath);
      } else {
        out.set(relPath, {
          type: "file",
          mode: stat.mode & 0o7777,
          data: await fs.readFile(full),
        });
      }
    }
  };
  await walk(root, "");
  return out;
}

// The LCG the fixture tree was generated with.
function pattern(length: number, seed: number): Buffer {
  const out = Buffer.alloc(length);
  let x = seed;
  for (let i = 0; i < length; i++) {
    x = (x * 1103515245 + 12345) >>> 0;
    out[i] = x >>> 24;
  }
  return out;
}

const EXPECTED_TREE: [string, DiskNode][] = [
  ["PG_VERSION", { type: "file", mode: 0o600, data: Buffer.from("17\n") }],
  ["base", { type: "dir", mode: 0o711 }],
  ["base/5", { type: "dir", mode: 0o711 }],
  ["base/5/1259", { type: "file", mode: 0o600, data: pattern(5000, 1) }],
  ["base/5/1259_fsm", { type: "file", mode: 0o600, data: pattern(123, 2) }],
  ["pg_empty", { type: "dir", mode: 0o755 }],
  ["postmaster.opts", { type: "file", mode: 0o644, data: Buffer.alloc(0) }],
  ["données", { type: "dir", mode: 0o751 }],
  [
    "données/ü-日本.txt",
    { type: "file", mode: 0o640, data: Buffer.from("non-ascii path") },
  ],
];

function diskMemFs(root: string): LegacyMemFs {
  const S_IFDIR = 0o040000;
  const S_IFREG = 0o100000;
  const onDisk = (p: string) => path.join(root, path.relative(root, p));
  return {
    readdir: (p) => [".", "..", ...readdirSync(onDisk(p)).sort()],
    stat: (p) => {
      const s = statSync(onDisk(p));
      return { mode: s.mode, size: s.size };
    },
    readFile: (p) => readFileSync(onDisk(p)),
    isDir: (mode) => (mode & 0o170000) === S_IFDIR,
    isFile: (mode) => (mode & 0o170000) === S_IFREG,
  };
}

describe("extractSnapshot", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tempDirs.splice(0)) await fs.rm(dir, RM);
  });

  async function mktemp(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "snapshot-reader-"));
    tempDirs.push(dir);
    return dir;
  }

  async function extractFixtureInto(
    out: string,
    chunkSize?: number,
  ): Promise<Awaited<ReturnType<typeof extractSnapshot>>> {
    return extractSnapshot(FIXTURE, out, { chunkSize });
  }

  it("extracts the fixture to disk as the deterministic tree", async () => {
    const out = await mktemp();
    const result = await extractFixtureInto(out);
    expect(result.pgVersionMajor).toBe(17);
    expect(result.pgControl).toBeUndefined();
    expect(result.entries).toBe(EXPECTED_TREE.length);
    expect(result.bytes).toBe((await fs.stat(FIXTURE)).size);

    const tree = await walkTree(out);
    expect([...tree.keys()].sort()).toEqual(
      EXPECTED_TREE.map(([p]) => p).sort(),
    );
    for (const [relPath, expected] of EXPECTED_TREE) {
      const actual = tree.get(relPath)!;
      expect(actual.type, relPath).toBe(expected.type);
      if (expected.type === "file") {
        expect(actual.data!.equals(expected.data!), relPath).toBe(true);
      }
      if (POSIX) {
        const mode =
          expected.type === "dir" ? dirMode(expected.mode) : expected.mode;
        expect(actual.mode.toString(8), relPath).toBe(mode.toString(8));
      }
    }
  });

  it.each([1, 7, 1024])(
    "extracts through short reads (chunk size %i)",
    async (chunkSize) => {
      const out = await mktemp();
      await extractFixtureInto(out, chunkSize);
      const tree = await walkTree(out);
      expect(tree.size).toBe(EXPECTED_TREE.length);
      expect(tree.get("base/5/1259")!.data!.equals(pattern(5000, 1))).toBe(
        true,
      );
    },
  );

  it("test writer matches the legacy serializer byte for byte over the extracted tree", async () => {
    const out = await mktemp();
    await extractFixtureInto(out);
    const legacy = Buffer.from(legacySerializeMemfs(diskMemFs(out), out));
    const written = encodeSnapshot(await collectDiskEntries(out));
    expect(written.equals(legacy)).toBe(true);
  });

  it("round-trips a tree through the test writer and back", async () => {
    const a = await mktemp();
    const b = await mktemp();
    await extractFixtureInto(a);
    const snapshot = path.join(await mktemp(), "snapshot.bin");
    const { entries } = await writeSnapshotFromDir(a, snapshot);
    expect(entries).toBe(EXPECTED_TREE.length);
    const result = await extractSnapshot(snapshot, b);
    expect(result.entries).toBe(EXPECTED_TREE.length);
    const treeA = await walkTree(a);
    const treeB = await walkTree(b);
    expect([...treeB.keys()]).toEqual([...treeA.keys()]);
    for (const [relPath, nodeA] of treeA) {
      const nodeB = treeB.get(relPath)!;
      expect(nodeB.type).toBe(nodeA.type);
      if (POSIX) expect(nodeB.mode).toBe(nodeA.mode);
      if (nodeA.data) expect(nodeB.data!.equals(nodeA.data)).toBe(true);
    }
  });

  it("rejects a truncated snapshot", async () => {
    const dir = await mktemp();
    const fixture = await fs.readFile(FIXTURE);
    const truncated = path.join(dir, "snapshot.bin");
    await fs.writeFile(truncated, fixture.subarray(0, fixture.byteLength - 10));
    const out = await mktemp();
    await expect(extractSnapshot(truncated, out)).rejects.toThrow(
      /truncated snapshot/,
    );
  });

  it("rejects a bad magic", async () => {
    const dir = await mktemp();
    const fixture = Buffer.from(await fs.readFile(FIXTURE));
    fixture[0] ^= 0xff;
    const bad = path.join(dir, "snapshot.bin");
    await fs.writeFile(bad, fixture);
    const out = await mktemp();
    await expect(extractSnapshot(bad, out)).rejects.toThrow(
      /invalid snapshot magic/,
    );
    expect(await fs.readdir(out)).toEqual([]);
  });

  it("rejects an unsupported format version", async () => {
    const dir = await mktemp();
    const fixture = Buffer.from(await fs.readFile(FIXTURE));
    fixture.writeUInt32LE(2, 4);
    const bad = path.join(dir, "snapshot.bin");
    await fs.writeFile(bad, fixture);
    await expect(extractSnapshot(bad, await mktemp())).rejects.toThrow(
      /unsupported snapshot version 2/,
    );
  });

  it("skips postmaster.pid", async () => {
    const src = await mktemp();
    await fs.writeFile(path.join(src, "PG_VERSION"), "17\n");
    await fs.writeFile(path.join(src, "postmaster.pid"), "42\n");
    await fs.mkdir(path.join(src, "global"));
    await fs.writeFile(
      path.join(src, "global", "pg_control"),
      pattern(8192, 3),
    );
    const snapshot = path.join(await mktemp(), "snapshot.bin");
    const { entries } = await writeSnapshotFromDir(src, snapshot);
    expect(entries).toBe(4);

    const out = await mktemp();
    const result = await extractSnapshot(snapshot, out);
    expect(result.entries).toBe(3);
    expect(result.pgControl!.equals(pattern(8192, 3))).toBe(true);
    expect((await fs.readdir(out)).sort()).toEqual(["PG_VERSION", "global"]);
  });

  it("rejects a snapshot without PG_VERSION", async () => {
    const src = await mktemp();
    await fs.writeFile(path.join(src, "postgresql.conf"), "");
    const snapshot = path.join(await mktemp(), "snapshot.bin");
    await writeSnapshotFromDir(src, snapshot);
    await expect(extractSnapshot(snapshot, await mktemp())).rejects.toThrow(
      /no PG_VERSION entry/,
    );
  });

  it("rejects an entry path that escapes the data dir", async () => {
    const snapshot = path.join(await mktemp(), "snapshot.bin");
    await fs.writeFile(
      snapshot,
      encodeSnapshot([
        { type: 1, mode: 0o600, relPath: "../escape", data: Buffer.from("x") },
      ]),
    );
    await expect(extractSnapshot(snapshot, await mktemp())).rejects.toThrow(
      /escapes the data dir/,
    );
  });
});
