import { PGlite } from "@electric-sql/pglite";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AtomicNodeFs } from "../src/atomic-node-fs.js";

describe("AtomicNodeFs", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tempDirs.splice(0)) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  async function mktemp(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "atomic-nodefs-"));
    tempDirs.push(dir);
    return dir;
  }

  it("round-trips data across close/reopen via a single snapshot file", async () => {
    const dir = await mktemp();

    const pg1 = new PGlite({ fs: new AtomicNodeFs(dir) });
    await pg1.exec("CREATE TABLE t (id int, name text)");
    await pg1.exec("INSERT INTO t VALUES (1, 'alpha'), (2, 'beta')");
    await pg1.close();

    expect(
      await fs.stat(path.join(dir, "snapshot.bin")).then((s) => s.isFile()),
    ).toBe(true);
    expect(
      await fs.stat(path.join(dir, "snapshot.bin.tmp")).then(
        () => true,
        () => false,
      ),
    ).toBe(false);

    const pg2 = new PGlite({ fs: new AtomicNodeFs(dir) });
    const rows = await pg2.query<{ id: number; name: string }>(
      "SELECT id, name FROM t ORDER BY id",
    );
    expect(rows.rows).toEqual([
      { id: 1, name: "alpha" },
      { id: 2, name: "beta" },
    ]);
    await pg2.close();
  });

  it("ignores and cleans up a stale snapshot.bin.tmp on startup", async () => {
    const dir = await mktemp();

    const pg1 = new PGlite({ fs: new AtomicNodeFs(dir) });
    await pg1.exec("CREATE TABLE t (v int)");
    await pg1.exec("INSERT INTO t VALUES (42)");
    await pg1.close();

    // Simulate a prior interrupted syncToFs: a half-written tmp file.
    await fs.writeFile(
      path.join(dir, "snapshot.bin.tmp"),
      Buffer.from("not a real snapshot"),
    );

    const pg2 = new PGlite({ fs: new AtomicNodeFs(dir) });
    const rows = await pg2.query<{ v: number }>("SELECT v FROM t");
    expect(rows.rows).toEqual([{ v: 42 }]);

    // The stale tmp file should be gone after initialSyncFs.
    await expect(fs.stat(path.join(dir, "snapshot.bin.tmp"))).rejects.toThrow(
      /ENOENT/,
    );
    await pg2.close();
  });

  it("auto-migrates a legacy loose-files PGLite data dir into a snapshot", async () => {
    const dir = await mktemp();

    // Step 1: create a legacy-style dir by running PGLite with the default
    // NodeFS-backed FS at this path. After close, the dir contains loose PG
    // files (PG_VERSION, pg_wal, base/, etc.) — the same shape that a prior
    // switchboard build would have left behind.
    const pgLegacy = new PGlite(dir);
    await pgLegacy.exec("CREATE TABLE legacy_t (id int, payload text)");
    await pgLegacy.exec(
      "INSERT INTO legacy_t VALUES (1, 'pre-migration'), (2, 'still here')",
    );
    await pgLegacy.close();

    expect(
      await fs.stat(path.join(dir, "PG_VERSION")).then((s) => s.isFile()),
    ).toBe(true);
    expect(
      await fs.stat(path.join(dir, "snapshot.bin")).then(
        () => true,
        () => false,
      ),
    ).toBe(false);

    // Step 2: reopen with AtomicNodeFs. Migration kicks in — loose files are
    // read into MEMFS, the existing data is queryable, and on close a
    // snapshot.bin is written alongside the preserved legacy files.
    const pg2 = new PGlite({ fs: new AtomicNodeFs(dir) });
    const rows = await pg2.query<{ id: number; payload: string }>(
      "SELECT id, payload FROM legacy_t ORDER BY id",
    );
    expect(rows.rows).toEqual([
      { id: 1, payload: "pre-migration" },
      { id: 2, payload: "still here" },
    ]);
    await pg2.close();

    expect(
      await fs.stat(path.join(dir, "snapshot.bin")).then((s) => s.isFile()),
    ).toBe(true);
    // Legacy files preserved (manual cleanup by user once verified).
    expect(
      await fs.stat(path.join(dir, "PG_VERSION")).then((s) => s.isFile()),
    ).toBe(true);

    // Step 3: reopen once more — this time loading from snapshot.bin rather
    // than re-walking legacy files — and verify data still round-trips.
    const pg3 = new PGlite({ fs: new AtomicNodeFs(dir) });
    const rows2 = await pg3.query<{ id: number }>(
      "SELECT count(*)::int as id FROM legacy_t",
    );
    expect(rows2.rows[0]?.id).toBe(2);
    await pg3.close();
  });
});
