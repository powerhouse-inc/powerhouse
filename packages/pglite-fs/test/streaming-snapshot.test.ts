import { PGlite } from "@electric-sql/pglite";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  AtomicNodeFs,
  collectEntries,
  restoreMemfs,
  setIoChunkSizeForTests,
  writeEntries,
} from "../src/atomic-node-fs.js";
import {
  buildDeterministicTree,
  FAKE_LARGE_FILE_SIZE,
  FAKE_ROOT,
  FakeMemFs,
} from "./fake-memfs.js";
import { legacySerializeMemfs } from "./legacy-serializer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, "fixtures", "deterministic-tree.v1.bin");

type PgMemFs = Parameters<typeof collectEntries>[0];

function memFsOf(pg: PGlite): PgMemFs {
  return pg.Module.FS as unknown as PgMemFs;
}

function recordingWriter(maxPerCall = Infinity) {
  const chunks: { position: number; bytes: Buffer }[] = [];
  return {
    chunks,
    handle: {
      write: (
        buffer: Uint8Array,
        offset = 0,
        length = buffer.byteLength - offset,
        position = 0,
      ) => {
        const n = Math.min(length, maxPerCall);
        chunks.push({
          position,
          bytes: Buffer.from(buffer.subarray(offset, offset + n)),
        });
        return Promise.resolve({ bytesWritten: n, buffer });
      },
    } as Parameters<typeof writeEntries>[0],
    bytes: () => {
      for (let i = 1; i < chunks.length; i++) {
        const prev = chunks[i - 1];
        expect(chunks[i].position).toBe(prev.position + prev.bytes.byteLength);
      }
      return Buffer.concat(chunks.map((c) => c.bytes));
    },
  };
}

function shortReader(source: Uint8Array, maxPerCall: number) {
  let calls = 0;
  return {
    calls: () => calls,
    handle: {
      read: (
        buffer: Uint8Array,
        offset: number,
        length: number,
        position: number,
      ) => {
        calls++;
        const n = Math.max(
          0,
          Math.min(length, maxPerCall, source.byteLength - position),
        );
        buffer.set(source.subarray(position, position + n), offset);
        return Promise.resolve({ bytesRead: n, buffer });
      },
    } as unknown as Parameters<typeof restoreMemfs>[2],
  };
}

describe("AtomicNodeFs streaming snapshot format", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    setIoChunkSizeForTests();
    for (const dir of tempDirs.splice(0)) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  async function mktemp(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "atomic-stream-"));
    tempDirs.push(dir);
    return dir;
  }

  it("fixture matches the legacy serializer for the deterministic tree", async () => {
    const fixture = await fs.readFile(FIXTURE);
    const legacy = legacySerializeMemfs(buildDeterministicTree(), FAKE_ROOT);
    expect(Buffer.from(legacy).equals(fixture)).toBe(true);
  });

  it.each([undefined, 1024, 7, 1])(
    "writes bytes identical to the legacy serializer (chunk size %s)",
    async (chunkSize) => {
      setIoChunkSizeForTests(chunkSize);
      const fixture = await fs.readFile(FIXTURE);
      const rec = recordingWriter();
      await writeEntries(
        rec.handle,
        collectEntries(buildDeterministicTree(), FAKE_ROOT),
      );
      expect(rec.bytes().equals(fixture)).toBe(true);
      if (chunkSize !== undefined) {
        expect(rec.chunks.length).toBeGreaterThanOrEqual(
          Math.ceil(fixture.byteLength / chunkSize),
        );
        for (const c of rec.chunks) {
          expect(c.bytes.byteLength).toBeLessThanOrEqual(chunkSize);
        }
      }
    },
  );

  it("splits a file larger than the chunk size across writes", async () => {
    setIoChunkSizeForTests(1024);
    const rec = recordingWriter();
    await writeEntries(
      rec.handle,
      collectEntries(buildDeterministicTree(), FAKE_ROOT),
    );
    const total = rec.chunks.reduce((n, c) => n + c.bytes.byteLength, 0);
    expect(total).toBeGreaterThan(FAKE_LARGE_FILE_SIZE);
    expect(rec.chunks.length).toBeGreaterThan(FAKE_LARGE_FILE_SIZE / 1024);
  });

  it("resumes after short writes", async () => {
    const fixture = await fs.readFile(FIXTURE);
    const rec = recordingWriter(3);
    await writeEntries(
      rec.handle,
      collectEntries(buildDeterministicTree(), FAKE_ROOT),
    );
    expect(rec.bytes().equals(fixture)).toBe(true);
  });

  it("restores the fixture into an identical tree", async () => {
    const fh = await fs.open(FIXTURE, "r");
    const target = new FakeMemFs();
    try {
      const { size } = await fh.stat();
      await restoreMemfs(target, FAKE_ROOT, fh, size);
    } finally {
      await fh.close();
    }
    const fixture = await fs.readFile(FIXTURE);
    expect(
      Buffer.from(legacySerializeMemfs(target, FAKE_ROOT)).equals(fixture),
    ).toBe(true);
    expect(
      new TextDecoder().decode(
        target.readFile(FAKE_ROOT + "/données/ü-日本.txt"),
      ),
    ).toBe("non-ascii path");
    expect(target.stat(FAKE_ROOT + "/base/5/1259").mode & 0o7777).toBe(0o600);
  });

  it.each([1, 5, 1024])(
    "restores through short reads (max %i bytes per read)",
    async (maxPerCall) => {
      setIoChunkSizeForTests(64);
      const fixture = await fs.readFile(FIXTURE);
      const reader = shortReader(fixture, maxPerCall);
      const target = new FakeMemFs();
      await restoreMemfs(target, FAKE_ROOT, reader.handle, fixture.byteLength);
      expect(
        Buffer.from(legacySerializeMemfs(target, FAKE_ROOT)).equals(fixture),
      ).toBe(true);
      expect(reader.calls()).toBeGreaterThanOrEqual(
        Math.ceil(fixture.byteLength / Math.min(maxPerCall, 64)),
      );
    },
  );

  it("rejects a truncated snapshot", async () => {
    const fixture = await fs.readFile(FIXTURE);
    const truncated = fixture.subarray(0, fixture.byteLength - 10);
    const reader = shortReader(truncated, 1024);
    await expect(
      restoreMemfs(
        new FakeMemFs(),
        FAKE_ROOT,
        reader.handle,
        truncated.byteLength,
      ),
    ).rejects.toThrow(/truncated snapshot/);
  });

  it("writes the same bytes as the legacy serializer for a real PGlite tree", async () => {
    const pg = new PGlite({ fs: new AtomicNodeFs(await mktemp()) });
    await pg.exec("CREATE TABLE t (id int, name text)");
    await pg.exec("INSERT INTO t VALUES (1, 'alpha'), (2, 'beta')");

    const legacy = legacySerializeMemfs(memFsOf(pg), "/tmp/pglite/base");
    setIoChunkSizeForTests(256 * 1024);
    const rec = recordingWriter();
    await writeEntries(
      rec.handle,
      collectEntries(memFsOf(pg), "/tmp/pglite/base"),
    );
    await pg.close();

    expect(rec.chunks.length).toBeGreaterThan(10);
    expect(rec.bytes().equals(Buffer.from(legacy))).toBe(true);
  });

  it("loads a snapshot written by the legacy serializer", async () => {
    const pg1 = new PGlite({ fs: new AtomicNodeFs(await mktemp()) });
    await pg1.exec("CREATE TABLE golden (id int PRIMARY KEY, name text)");
    await pg1.exec(
      "INSERT INTO golden VALUES (1, 'alpha'), (2, 'beta'), (3, 'gamma')",
    );
    const legacyDir = await mktemp();
    await fs.writeFile(
      path.join(legacyDir, "snapshot.bin"),
      legacySerializeMemfs(memFsOf(pg1), "/tmp/pglite/base"),
    );
    await pg1.close();

    const pg2 = new PGlite({ fs: new AtomicNodeFs(legacyDir) });
    const rows = await pg2.query<{ id: number; name: string }>(
      "SELECT id, name FROM golden ORDER BY id",
    );
    expect(rows.rows).toEqual([
      { id: 1, name: "alpha" },
      { id: 2, name: "beta" },
      { id: 3, name: "gamma" },
    ]);
    await pg2.close();
  });

  it("round-trips a real PGlite store with a tiny chunk size", async () => {
    setIoChunkSizeForTests(64 * 1024);
    const dir = await mktemp();

    const pg1 = new PGlite({ fs: new AtomicNodeFs(dir) });
    await pg1.exec("CREATE TABLE t (id int PRIMARY KEY, payload text)");
    await pg1.exec(
      "INSERT INTO t SELECT g, repeat('x', 500) FROM generate_series(1, 2000) g",
    );
    await pg1.close();

    const { size } = await fs.stat(path.join(dir, "snapshot.bin"));
    expect(size).toBeGreaterThan(64 * 1024 * 100);

    const pg2 = new PGlite({ fs: new AtomicNodeFs(dir) });
    const rows = await pg2.query<{ count: number; total: number }>(
      "SELECT count(*)::int AS count, sum(length(payload))::int AS total FROM t",
    );
    expect(rows.rows).toEqual([{ count: 2000, total: 2000 * 500 }]);
    await pg2.close();
  });
});
