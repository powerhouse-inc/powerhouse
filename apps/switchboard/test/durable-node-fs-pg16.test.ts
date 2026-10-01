import { createDurableNodeFs } from "@powerhousedao/reactor-api/pglite-node";
import nodeFs, { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadNodeFsClass, loadPGliteModule } from "../src/pglite-version.js";

// initdb with fsync on issues ~1800 host syncs (18 s on a Mac); the Windows
// runner is several times slower.
const BOOT = 180_000;
const COMMITS = 10;
const RM = { recursive: true, force: true, maxRetries: 10 } as const;

describe("durable NodeFS over pglite-legacy-02 (PG16)", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tempDirs.splice(0)) {
      await fs.rm(dir, RM);
    }
  });

  it(
    "opens a PG16 dir over pglite-legacy-02 with the durable fs",
    async () => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), "durable-pg16-"));
      tempDirs.push(dir);
      const counts = { fsync: 0, fdatasync: 0 };
      const hostFs = {
        fsyncSync: (fd: number) => {
          counts.fsync++;
          nodeFs.fsyncSync(fd);
        },
        fdatasyncSync: (fd: number) => {
          counts.fdatasync++;
          nodeFs.fdatasyncSync(fd);
        },
      };
      const [{ PGlite }, NodeFS] = await Promise.all([
        loadPGliteModule(16),
        loadNodeFsClass(16),
      ]);
      const pg = new PGlite({
        fs: createDurableNodeFs(NodeFS, dir, {
          hostFs,
          maintenanceIntervalMs: 0,
        }),
      });
      try {
        await pg.waitReady;
        const version = await pg.query<{ v: string }>(
          "SELECT current_setting('server_version_num') AS v",
        );
        expect(version.rows[0].v.startsWith("16")).toBe(true);
        await pg.exec("CREATE TABLE t (v int)");
        const before = counts.fdatasync;
        for (let i = 0; i < COMMITS; i++) {
          await pg.exec(`INSERT INTO t VALUES (${i})`);
        }
        const perCommit = counts.fdatasync - before;
        const fsyncBefore = counts.fsync;
        await pg.exec("CHECKPOINT");
        const checkpointSyncs = counts.fsync - fsyncBefore;
        console.info(
          `pglite-legacy-02: ${perCommit} host fdatasync over ${COMMITS} commits, ${checkpointSyncs} host fsync on CHECKPOINT, ${fsyncBefore} host fsync since open`,
        );
        // Pins decision 5's outcome on 0.2.17: WAL goes through
        // open_datasync, which never reaches the fdatasync hook, so commits
        // are not synced; the stream-op patch does take (CHECKPOINT syncs).
        expect(perCommit).toBe(0);
        expect(checkpointSyncs).toBeGreaterThan(0);
      } finally {
        await pg.close();
      }
      expect(
        (await fs.readFile(path.join(dir, "PG_VERSION"), "utf8")).trim(),
      ).toBe("16");
    },
    BOOT,
  );
});
