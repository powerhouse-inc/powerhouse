import { PGlite } from "@electric-sql/pglite";
import { NodeFS } from "@electric-sql/pglite/nodefs";
import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDurableNodeFs,
  type DurableNodeFsOptions,
} from "../../src/pglite/durable-node-fs.js";
import { dirBytes, PgliteMaintenance } from "../../src/pglite/maintenance.js";

// Waits span real VACUUM passes, which slow under load.
const IO_WAIT = { timeout: 60_000 };
const LONG = 180_000;

const DOCS = 20;

describe("durable NodeFS maintenance", () => {
  const tempDirs: string[] = [];
  const open: PGlite[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const pg of open.splice(0)) {
      if (!pg.closed) await pg.close().catch(() => undefined);
    }
    for (const dir of tempDirs.splice(0)) {
      await fs.rm(dir, { recursive: true, force: true, maxRetries: 5 });
    }
  });

  async function start(options: DurableNodeFsOptions, dir?: string) {
    if (!dir) {
      dir = await fs.mkdtemp(path.join(os.tmpdir(), "durable-maint-"));
      tempDirs.push(dir);
    }
    const warn = vi.fn();
    // fsync is not under test here; it only slows initdb.
    const durableFs = createDurableNodeFs(NodeFS, dir, {
      logger: { warn },
      fsync: false,
      ...options,
    });
    const pg = new PGlite({ fs: durableFs });
    open.push(pg);
    await pg.waitReady;
    const maintain = () => durableFs.maintenance.run();
    return { dir, pg, durableFs, warn, maintain };
  }

  async function createSnapTable(pg: PGlite) {
    await pg.exec(
      "CREATE TABLE snap (doc text PRIMARY KEY, content jsonb NOT NULL)",
    );
    for (let d = 0; d < DOCS; d++) {
      await pg.query("INSERT INTO snap VALUES ($1, $2)", [`d${d}`, body()]);
    }
  }

  async function update(pg: PGlite, ops: number, onEvery?: () => unknown) {
    for (let i = 1; i <= ops; i++) {
      await pg.query("BEGIN");
      await pg.query("UPDATE snap SET content = $1 WHERE doc = $2", [
        body(),
        `d${i % DOCS}`,
      ]);
      await pg.query("COMMIT");
      if (onEvery && i % 50 === 0) await onEvery();
    }
  }

  async function tableBytes(pg: PGlite): Promise<number> {
    const { rows } = await pg.query<{ n: string }>(
      "SELECT pg_total_relation_size('snap')::text AS n",
    );
    return Number(rows[0].n);
  }

  async function walBytes(pg: PGlite): Promise<number> {
    const { rows } = await pg.query<{ n: string | null }>(
      "SELECT sum(size)::text AS n FROM pg_ls_waldir()",
    );
    return Number(rows[0].n ?? 0);
  }

  function baseBytes(dir: string): Promise<number> {
    return dirBytes(path.join(dir, "base"));
  }

  it.each([
    ["BEGIN", "BEGIN"],
    ["START TRANSACTION", "START TRANSACTION ISOLATION LEVEL SERIALIZABLE"],
  ])(
    "skips while a plain %s transaction is open and keeps its writes",
    async (_label, begin) => {
      const { dir, pg, durableFs, maintain } = await start({
        maintenanceIntervalMs: 10,
      });
      await pg.exec("CREATE TABLE t (v int)");
      const run = vi.spyOn(durableFs.maintenance, "run");

      await pg.query(begin);
      await pg.query("INSERT INTO t VALUES (1)");
      const skipped = run.mock.results.length;
      await vi.waitFor(
        async () =>
          expect(await outcomes(run, skipped)).toContain("in-transaction"),
        IO_WAIT,
      );
      await expect(maintain()).resolves.toBe("in-transaction");
      const committed = run.mock.results.length;
      await pg.query("COMMIT");

      expect((await pg.query("SELECT v FROM t")).rows).toEqual([{ v: 1 }]);
      await vi.waitFor(
        async () => expect(await outcomes(run, committed)).toContain("vacuum"),
        IO_WAIT,
      );
      await pg.close();

      const reopened = new PGlite({ fs: new NodeFS(dir) });
      open.push(reopened);
      expect((await reopened.query("SELECT v FROM t")).rows).toEqual([
        { v: 1 },
      ]);
    },
    LONG,
  );

  it(
    "holds table size steady under update churn",
    async () => {
      const off = await start({ maintenanceIntervalMs: 0 });
      await createSnapTable(off.pg);
      await update(off.pg, 300);
      const offAtN = await tableBytes(off.pg);
      await update(off.pg, 300);
      const offAt2N = await tableBytes(off.pg);

      const on = await start({ maintenanceIntervalMs: 0 });
      await createSnapTable(on.pg);
      await update(on.pg, 300, on.maintain);
      const onAtN = await tableBytes(on.pg);
      await update(on.pg, 300, on.maintain);
      const onAt2N = await tableBytes(on.pg);

      expect(offAt2N).toBeGreaterThan(offAtN * 1.5);
      expect(onAt2N).toBeLessThanOrEqual(onAtN * 1.2);
      expect(onAt2N).toBeLessThan(offAt2N / 2);
    },
    LONG,
  );

  it(
    "bounds pg_wal with periodic checkpoints",
    async () => {
      const off = await start({ maintenanceIntervalMs: 0 });
      await createSnapTable(off.pg);
      await update(off.pg, 600);
      const offWal = await walBytes(off.pg);

      const on = await start({ maintenanceIntervalMs: 0 });
      await createSnapTable(on.pg);
      await update(on.pg, 300, on.maintain);
      const onWalAtN = await walBytes(on.pg);
      await update(on.pg, 300, on.maintain);
      const onWalAt2N = await walBytes(on.pg);

      expect(onWalAt2N).toBeLessThanOrEqual(onWalAtN);
      expect(onWalAt2N).toBeLessThan(offWal);
    },
    LONG,
  );

  it(
    "runs VACUUM FULL once when base/ is oversized at open",
    async () => {
      const seed = await start({ maintenanceIntervalMs: 0 });
      await createSnapTable(seed.pg);
      await update(seed.pg, 1200);
      await seed.pg.close();

      const small = await start(
        {
          maintenanceIntervalMs: 0,
          vacuumFullAboveBytes: (await baseBytes(seed.dir)) * 2,
        },
        seed.dir,
      );
      await expect(small.maintain()).resolves.not.toBe("vacuum-full");
      await small.pg.close();
      const bloated = await baseBytes(seed.dir);

      const big = await start(
        {
          maintenanceIntervalMs: 0,
          vacuumFullAboveBytes: bloated - 1,
          vacuumFullQuietMs: 0,
        },
        seed.dir,
      );
      const before = await tableBytes(big.pg);
      await expect(big.maintain()).resolves.toBe("vacuum-full");
      expect(big.warn).toHaveBeenCalledWith(
        expect.stringContaining("running VACUUM FULL"),
      );
      // The logger here has no info, so the completion report lands on warn.
      expect(big.warn).toHaveBeenCalledWith(
        expect.stringMatching(
          /VACUUM FULL finished in \d+ ms; \d+ -> \d+ bytes/,
        ),
      );
      expect(await tableBytes(big.pg)).toBeLessThan(before / 4);
      await big.pg.query("SELECT 1");
      await expect(big.maintain()).resolves.toBe("vacuum");
      await big.pg.close();

      expect(await baseBytes(seed.dir)).toBeLessThan(bloated * 0.8);
      const reopened = new PGlite({ fs: new NodeFS(seed.dir) });
      open.push(reopened);
      const { rows } = await reopened.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM snap",
      );
      expect(rows[0].n).toBe(DOCS);
    },
    LONG,
  );

  it(
    "defers VACUUM FULL until the store has been quiet",
    async () => {
      const seed = await start({ maintenanceIntervalMs: 0 });
      await seed.pg.exec("CREATE TABLE t (v int)");
      await seed.pg.close();

      let now = 1_000_000;
      const { pg, warn, maintain } = await start(
        {
          maintenanceIntervalMs: 0,
          vacuumFullAboveBytes: 1,
          vacuumFullQuietMs: 60_000,
          now: () => now,
        },
        seed.dir,
      );
      await pg.query("INSERT INTO t VALUES (0)");
      await expect(maintain()).resolves.toBe("vacuum");
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(
          "VACUUM FULL waits until the store has had no writes for 60000 ms",
        ),
      );
      now += 30_000;
      await pg.query("INSERT INTO t VALUES (1)");
      now += 59_000;
      await expect(maintain()).resolves.toBe("vacuum");
      now += 1_000;
      await expect(maintain()).resolves.toBe("vacuum-full");
      await expect(maintain()).resolves.toBe("idle");
    },
    LONG,
  );

  it(
    "never forces a VACUUM FULL on a busy store unless a deadline is set",
    async () => {
      const seed = await start({ maintenanceIntervalMs: 0 });
      await seed.pg.exec("CREATE TABLE t (v int)");
      await seed.pg.close();

      let now = 1_000_000;
      const { pg, warn, maintain } = await start(
        {
          maintenanceIntervalMs: 0,
          vacuumFullAboveBytes: 1,
          vacuumFullQuietMs: 60_000,
          now: () => now,
        },
        seed.dir,
      );
      // Writes every 30 s for 35 min, past the old deadline: no quiet window, no deadline.
      for (let halfMinute = 0; halfMinute < 70; halfMinute++) {
        await pg.query("INSERT INTO t VALUES (1)");
        now += 30_000;
        await expect(maintain()).resolves.toBe("vacuum");
      }
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(
          "VACUUM FULL waits until the store has had no writes for 60000 ms",
        ),
      );
      expect(warn).not.toHaveBeenCalledWith(
        expect.stringContaining("from open"),
      );
      now += 60_000;
      await expect(maintain()).resolves.toBe("vacuum-full");
    },
    LONG,
  );

  it(
    "runs a deferred VACUUM FULL once it is overdue, even on a store that is never quiet",
    async () => {
      const seed = await start({ maintenanceIntervalMs: 0 });
      await seed.pg.exec("CREATE TABLE t (v int)");
      await seed.pg.close();

      let now = 1_000_000;
      const { pg, warn, maintain } = await start(
        {
          maintenanceIntervalMs: 0,
          vacuumFullAboveBytes: 1,
          vacuumFullQuietMs: 60_000,
          vacuumFullMaxDeferMs: 300_000,
          now: () => now,
        },
        seed.dir,
      );
      for (let minute = 0; minute < 4; minute++) {
        await pg.query("INSERT INTO t VALUES (1)");
        now += 30_000;
        await expect(maintain()).resolves.toBe("vacuum");
        now += 30_000;
      }
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("or at most 300000 ms from open"),
      );
      await pg.query("INSERT INTO t VALUES (2)");
      now += 60_000;
      await expect(maintain()).resolves.toBe("vacuum-full");
    },
    LONG,
  );

  it("queues a pass at the gate and does not wait for it on stop", async () => {
    let open = (): void => undefined;
    const gateOpen = new Promise<void>((resolve) => {
      open = resolve;
    });
    let gated = 0;
    const gate = async <T>(task: () => Promise<T>): Promise<T> => {
      gated++;
      await gateOpen;
      return task();
    };
    const maintenance = new PgliteMaintenance({ intervalMs: 0, gate });
    const queued = maintenance.run();
    expect(gated).toBe(1);
    await maintenance.stop();
    open();
    await expect(queued).resolves.toBe("not-ready");
  });

  describe("rewriteTable", () => {
    const REQUEST = { schema: "public", table: "snap", requiredFreeBytes: 0 };

    it(
      "rewrites the one table and leaves the rest of the store",
      async () => {
        const { pg, durableFs, warn } = await start({
          maintenanceIntervalMs: 0,
          rewriteQuietMs: 0,
        });
        await createSnapTable(pg);
        await pg.exec("CREATE TABLE other (v text)");
        await pg.query("INSERT INTO other VALUES ('kept')");
        await update(pg, 200);
        await pg.query("DELETE FROM snap WHERE doc <> 'd0'");
        const before = await tableBytes(pg);

        const result = await durableFs.maintenance.rewriteTable(REQUEST);

        expect(result).toMatchObject({ outcome: "done" });
        expect(await tableBytes(pg)).toBeLessThan(before);
        const { rows } = await pg.query<{ doc: string }>(
          "SELECT doc FROM snap",
        );
        expect(rows).toEqual([{ doc: "d0" }]);
        const other = await pg.query<{ v: string }>("SELECT v FROM other");
        expect(other.rows).toEqual([{ v: "kept" }]);
        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining('running VACUUM FULL "public"."snap"'),
        );
      },
      LONG,
    );

    it(
      "waits for a gap in the writes and reports a store that never has one",
      async () => {
        const { pg, durableFs } = await start({
          maintenanceIntervalMs: 0,
          rewriteQuietMs: 60_000,
          rewriteMaxWaitMs: 300,
        });
        await pg.exec("CREATE TABLE snap (v int)");
        const exec = vi.spyOn(pg, "execProtocol");

        await expect(
          durableFs.maintenance.rewriteTable(REQUEST),
        ).resolves.toMatchObject({
          outcome: "busy",
          reason: expect.stringContaining("Try again") as string,
        });

        expect(exec).not.toHaveBeenCalled();
      },
      LONG,
    );

    it(
      "goes ahead once the writes leave a gap",
      async () => {
        const { pg, durableFs } = await start({
          maintenanceIntervalMs: 0,
          rewriteQuietMs: 400,
        });
        await pg.exec("CREATE TABLE snap (v int)");

        await expect(
          durableFs.maintenance.rewriteTable(REQUEST),
        ).resolves.toMatchObject({ outcome: "done" });
      },
      LONG,
    );

    it(
      "waits out an open transaction, then rewrites",
      async () => {
        const { pg, durableFs } = await start({
          maintenanceIntervalMs: 0,
          rewriteQuietMs: 0,
        });
        await pg.exec("CREATE TABLE snap (v int)");
        await pg.exec("BEGIN");
        await pg.exec("INSERT INTO snap VALUES (1)");

        const rewriting = durableFs.maintenance.rewriteTable(REQUEST);
        await new Promise((resolve) => setTimeout(resolve, 400));
        await pg.exec("COMMIT");

        await expect(rewriting).resolves.toMatchObject({ outcome: "done" });
        const { rows } = await pg.query("SELECT v FROM snap");
        expect(rows).toEqual([{ v: 1 }]);
      },
      LONG,
    );

    it(
      "takes its turn at the gate",
      async () => {
        let gated = 0;
        const { pg, durableFs } = await start({
          maintenanceIntervalMs: 0,
          rewriteQuietMs: 0,
          maintenanceGate: (task) => {
            gated++;
            return task();
          },
        });
        await pg.exec("CREATE TABLE snap (v int)");

        await durableFs.maintenance.rewriteTable(REQUEST);

        expect(gated).toBe(1);
      },
      LONG,
    );

    it(
      "refuses when the disk cannot hold the rewrite",
      async () => {
        const { pg, durableFs } = await start({
          maintenanceIntervalMs: 0,
          rewriteQuietMs: 0,
        });
        await pg.exec("CREATE TABLE snap (v int)");

        const result = await durableFs.maintenance.rewriteTable({
          ...REQUEST,
          requiredFreeBytes: Number.MAX_SAFE_INTEGER,
        });

        expect(result).toMatchObject({
          outcome: "refused",
          reason: expect.stringContaining("free disk") as string,
        });
      },
      LONG,
    );

    it(
      "reports a table that does not exist and leaves the store usable",
      async () => {
        const { pg, durableFs } = await start({
          maintenanceIntervalMs: 0,
          rewriteQuietMs: 0,
        });

        const result = await durableFs.maintenance.rewriteTable(REQUEST);

        expect(result).toMatchObject({ outcome: "refused" });
        await expect(pg.query("SELECT 1 AS one")).resolves.toMatchObject({
          rows: [{ one: 1 }],
        });
      },
      LONG,
    );

    it("refuses on a store that is closing", async () => {
      const maintenance = new PgliteMaintenance({ intervalMs: 0 });
      await maintenance.stop();

      await expect(maintenance.rewriteTable(REQUEST)).resolves.toEqual({
        outcome: "refused",
        reason: "the store is closing",
      });
    });
  });

  it(
    "reports idle when nothing was written since the last pass",
    async () => {
      const { pg, maintain } = await start({ maintenanceIntervalMs: 0 });
      await pg.exec("CREATE TABLE t (v int)");
      await expect(maintain()).resolves.toBe("vacuum");
      await expect(maintain()).resolves.toBe("idle");
    },
    LONG,
  );

  it(
    "stops the timer on close",
    async () => {
      const { pg, durableFs } = await start({ maintenanceIntervalMs: 5 });
      const state = durableFs.maintenance;
      const run = vi.spyOn(state, "run");
      await pg.exec("CREATE TABLE t (v int)");
      await vi.waitFor(() => expect(run).toHaveBeenCalled(), IO_WAIT);
      await pg.close();
      expect(state.scheduled).toBe(false);
      expect(state.running).toBe(false);
      const calls = run.mock.calls.length;
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(run).toHaveBeenCalledTimes(calls);
    },
    LONG,
  );
});

async function outcomes(
  spy: { mock: { results: { value: unknown }[] } },
  from: number,
): Promise<unknown[]> {
  return Promise.all(spy.mock.results.slice(from).map((r) => r.value));
}

function body(): { items: string[] } {
  return {
    items: Array.from({ length: 200 }, () =>
      crypto.randomBytes(24).toString("hex"),
    ),
  };
}
