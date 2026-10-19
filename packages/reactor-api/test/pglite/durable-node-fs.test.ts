import { PGlite } from "@electric-sql/pglite";
import { NodeFS } from "@electric-sql/pglite/nodefs";
import nodeFs, { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDurableNodeFs,
  resolvePgliteFsync,
  type DurableNodeFsOptions,
} from "../../src/pglite/durable-node-fs.js";
import { syncDirectory } from "../../src/pglite/sync-tree.js";

// A fresh initdb takes ~9 s under full-suite load; the Windows runner is slower.
const BOOT = 90_000;
const COMMITS = 10;

interface HostFsSpy {
  hostFs: NonNullable<DurableNodeFsOptions["hostFs"]>;
  counts: { fsync: number; fdatasync: number };
  failFdatasync: { current: boolean };
}

function spyHostFs(): HostFsSpy {
  const counts = { fsync: 0, fdatasync: 0 };
  const failFdatasync = { current: false };
  return {
    counts,
    failFdatasync,
    hostFs: {
      fsyncSync: (fd) => {
        nodeFs.fsyncSync(fd);
        counts.fsync++;
      },
      fdatasyncSync: (fd) => {
        if (failFdatasync.current) {
          const err = new Error("ENOSPC: no space left on device") as Error & {
            code: string;
          };
          err.code = "ENOSPC";
          throw err;
        }
        nodeFs.fdatasyncSync(fd);
        counts.fdatasync++;
      },
    },
  };
}

async function countInodes(
  root: string,
): Promise<{ files: number; dirs: number }> {
  const counts = { files: 0, dirs: 1 };
  const walk = async (dir: string) => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        counts.dirs++;
        await walk(path.join(dir, entry.name));
      } else if (entry.isFile()) {
        counts.files++;
      }
    }
  };
  await walk(root);
  return counts;
}

describe("createDurableNodeFs", () => {
  const tempDirs: string[] = [];
  const open: PGlite[] = [];

  afterEach(async () => {
    for (const pg of open.splice(0)) {
      if (!pg.closed) await pg.close().catch(() => undefined);
    }
    for (const dir of tempDirs.splice(0)) {
      await fs.rm(dir, { recursive: true, force: true, maxRetries: 5 });
    }
  });

  async function start(options: DurableNodeFsOptions) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "durable-nodefs-"));
    tempDirs.push(dir);
    const fsImpl = createDurableNodeFs(NodeFS, dir, {
      maintenanceIntervalMs: 0,
      ...options,
    });
    const pg = new PGlite({ fs: fsImpl });
    open.push(pg);
    await pg.waitReady;
    return { dir, pg, fsImpl };
  }

  it(
    "issues one fdatasync per commit with fsync on",
    async () => {
      const spy = spyHostFs();
      const { pg } = await start({ hostFs: spy.hostFs });
      await pg.exec("CREATE TABLE t (v int)");
      const before = spy.counts.fdatasync;
      for (let i = 0; i < COMMITS; i++) {
        await pg.exec(`INSERT INTO t VALUES (${i})`);
      }
      expect(spy.counts.fdatasync - before).toBe(COMMITS);
    },
    BOOT,
  );

  it(
    "fresh initdb issues no host syncs until init completes, then one tree sync",
    async () => {
      const spy = spyHostFs();
      const { dir, pg } = await start({ hostFs: spy.hostFs });
      // initdb alone issues 746 fdatasyncs on 0.3.15.
      expect(spy.counts.fdatasync).toBe(0);
      const inodes = await countInodes(dir);
      const dirSyncs = syncDirectory(dir) ? inodes.dirs : 0;
      expect(spy.counts.fsync).toBe(inodes.files + dirSyncs);

      await pg.exec("CREATE TABLE t (v int)");
      const before = spy.counts.fdatasync;
      for (let i = 0; i < COMMITS; i++) {
        await pg.exec(`INSERT INTO t VALUES (${i})`);
      }
      expect(spy.counts.fdatasync - before).toBe(COMMITS);
    },
    BOOT,
  );

  it(
    "reopening an existing store does not walk the tree",
    async () => {
      const first = await start({});
      await first.pg.exec("CREATE TABLE t (v int)");
      await first.pg.close();
      const inodes = await countInodes(first.dir);

      const spy = spyHostFs();
      const pg = new PGlite({
        fs: createDurableNodeFs(NodeFS, first.dir, {
          maintenanceIntervalMs: 0,
          hostFs: spy.hostFs,
        }),
      });
      open.push(pg);
      await pg.waitReady;
      expect(spy.counts.fsync).toBeLessThan(inodes.files / 2);

      const before = spy.counts.fdatasync;
      for (let i = 0; i < COMMITS; i++) {
        await pg.exec(`INSERT INTO t VALUES (${i})`);
      }
      expect(spy.counts.fdatasync - before).toBe(COMMITS);
    },
    BOOT,
  );

  it(
    "issues none with fsync off",
    async () => {
      const spy = spyHostFs();
      const { pg } = await start({ hostFs: spy.hostFs, fsync: false });
      await pg.exec("CREATE TABLE t (v int)");
      for (let i = 0; i < COMMITS; i++) {
        await pg.exec(`INSERT INTO t VALUES (${i})`);
      }
      await pg.exec("CHECKPOINT");
      expect(spy.counts).toEqual({ fsync: 0, fdatasync: 0 });
    },
    BOOT,
  );

  it(
    "fsyncs data files on an explicit CHECKPOINT",
    async () => {
      const spy = spyHostFs();
      const { pg } = await start({ hostFs: spy.hostFs });
      await pg.exec("CREATE TABLE t (v int)");
      for (let i = 0; i < COMMITS; i++) {
        await pg.exec(`INSERT INTO t VALUES (${i})`);
      }
      const before = spy.counts.fsync;
      await pg.exec("CHECKPOINT");
      const delta = spy.counts.fsync - before;
      // Reported for the plan; zero means the stream-op patch is never reached.
      console.info(`CHECKPOINT issued ${delta} host fsync calls`);
      expect(delta).toBeGreaterThan(0);
    },
    BOOT,
  );

  it(
    "routes a failing fdatasync to onAbort and leaves the instance closed",
    async () => {
      const spy = spyHostFs();
      const onAbort = vi.fn();
      const warn = vi.fn();
      const { pg } = await start({
        hostFs: spy.hostFs,
        onAbort,
        logger: { warn },
      });
      await pg.exec("CREATE TABLE t (v int)");
      spy.failFdatasync.current = true;

      await expect(pg.exec("INSERT INTO t VALUES (1)")).rejects.toThrow(
        /PGlite aborted/,
      );
      expect(onAbort).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("fdatasync failed"),
      );

      // close() rejects on the dead runtime; it must settle, not hang.
      await expect(pg.close()).rejects.toThrow(/PGlite aborted/);
      console.info(`pg.closed after abort: ${pg.closed}`);
      expect(pg.ready).toBe(false);
      await expect(pg.query("SELECT 1")).rejects.toThrow();
    },
    BOOT,
  );

  it("throws when the base options carry no instantiateWasm", async () => {
    class Bare extends NodeFS {
      async init(pg: PGlite, opts: Parameters<NodeFS["init"]>[1]) {
        const { emscriptenOpts } = await super.init(pg, opts);
        const { instantiateWasm: _dropped, ...rest } = emscriptenOpts as Record<
          string,
          unknown
        >;
        return { emscriptenOpts: rest as typeof emscriptenOpts };
      }
    }
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "durable-nodefs-"));
    tempDirs.push(dir);
    const pg = new PGlite({
      fs: createDurableNodeFs(Bare, dir, { maintenanceIntervalMs: 0 }),
    });
    await expect(pg.waitReady).rejects.toThrow(/instantiateWasm/);
  });

  it("resolvePgliteFsync reads PH_PGLITE_FSYNC", () => {
    expect(resolvePgliteFsync({})).toBe(true);
    expect(resolvePgliteFsync({ PH_PGLITE_FSYNC: "1" })).toBe(true);
    expect(resolvePgliteFsync({ PH_PGLITE_FSYNC: "0" })).toBe(false);
  });
});
