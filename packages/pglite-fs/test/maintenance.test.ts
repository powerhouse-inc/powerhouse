import { PGlite } from "@electric-sql/pglite";
import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AtomicNodeFs,
  type AtomicNodeFsOptions,
} from "../src/atomic-node-fs.js";

const DOCS = 20;

describe("AtomicNodeFs maintenance", () => {
  const tempDirs: string[] = [];
  const open: PGlite[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const pg of open.splice(0)) {
      if (!pg.closed) await pg.close().catch(() => undefined);
    }
    for (const dir of tempDirs.splice(0)) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  async function start(options: AtomicNodeFsOptions, dir?: string) {
    if (!dir) {
      dir = await fs.mkdtemp(path.join(os.tmpdir(), "atomic-maint-"));
      tempDirs.push(dir);
    }
    const warn = vi.fn();
    const atomicFs = new AtomicNodeFs(dir, {
      logger: { warn },
      flushIntervalMs: 60_000,
      ...options,
    });
    const pg = new PGlite({ fs: atomicFs });
    open.push(pg);
    await pg.waitReady;
    const maintain = () => atomicFs["runMaintenance"]();
    return { dir, pg, atomicFs, warn, maintain };
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

  async function snapshotBytes(dir: string): Promise<number> {
    return (await fs.stat(path.join(dir, "snapshot.bin"))).size;
  }

  it.each([
    ["BEGIN", "BEGIN"],
    ["START TRANSACTION", "START TRANSACTION ISOLATION LEVEL SERIALIZABLE"],
  ])(
    "skips while a plain %s transaction is open and keeps its writes",
    async (_label, begin) => {
      const { dir, pg, atomicFs, maintain } = await start({
        flushIntervalMs: 0,
        maintenanceIntervalMs: 10,
      });
      await pg.exec("CREATE TABLE t (v int)");
      const runMaintenance = vi.spyOn(
        atomicFs as unknown as { runMaintenance: () => Promise<string> },
        "runMaintenance",
      );

      await pg.query(begin);
      await pg.query("INSERT INTO t VALUES (1)");
      const skipped = runMaintenance.mock.results.length;
      await vi.waitFor(async () =>
        expect(await outcomes(runMaintenance, skipped)).toContain(
          "in-transaction",
        ),
      );
      await expect(maintain()).resolves.toBe("in-transaction");
      const committed = runMaintenance.mock.results.length;
      await pg.query("COMMIT");

      expect((await pg.query("SELECT v FROM t")).rows).toEqual([{ v: 1 }]);
      await vi.waitFor(async () =>
        expect(await outcomes(runMaintenance, committed)).toContain("vacuum"),
      );
      await pg.close();

      const reopened = new PGlite({ fs: new AtomicNodeFs(dir) });
      open.push(reopened);
      expect((await reopened.query("SELECT v FROM t")).rows).toEqual([
        { v: 1 },
      ]);
    },
  );

  it("holds table size steady under update churn", async () => {
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
  });

  it("bounds pg_wal with periodic checkpoints", async () => {
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
  });

  it("runs VACUUM FULL once when the loaded snapshot is oversized", async () => {
    const seed = await start({ maintenanceIntervalMs: 0 });
    await createSnapTable(seed.pg);
    await update(seed.pg, 1200);
    await seed.pg.close();

    const small = await start(
      {
        maintenanceIntervalMs: 0,
        vacuumFullAboveBytes: (await snapshotBytes(seed.dir)) * 2,
      },
      seed.dir,
    );
    await expect(small.maintain()).resolves.not.toBe("vacuum-full");
    await small.pg.close();
    const bloated = await snapshotBytes(seed.dir);

    const big = await start(
      { maintenanceIntervalMs: 0, vacuumFullAboveBytes: bloated - 1 },
      seed.dir,
    );
    const before = await tableBytes(big.pg);
    await expect(big.maintain()).resolves.toBe("vacuum-full");
    expect(big.warn).toHaveBeenCalledWith(
      expect.stringContaining("VACUUM FULL"),
    );
    expect(await tableBytes(big.pg)).toBeLessThan(before / 4);
    await big.pg.query("SELECT 1");
    await expect(big.maintain()).resolves.toBe("vacuum");
    await big.pg.close();

    expect(await snapshotBytes(seed.dir)).toBeLessThan(bloated * 0.8);
    const reopened = new PGlite({ fs: new AtomicNodeFs(seed.dir) });
    open.push(reopened);
    const { rows } = await reopened.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM snap",
    );
    expect(rows[0].n).toBe(DOCS);
  });

  it("does not rewrite the snapshot of an idle store", async () => {
    const { pg, maintain } = await start({ maintenanceIntervalMs: 0 });
    await pg.exec("CREATE TABLE t (v int)");
    await expect(maintain()).resolves.toBe("vacuum");
    await expect(maintain()).resolves.toBe("idle");
  });

  it("stops the timer on close", async () => {
    const { pg, atomicFs } = await start({ maintenanceIntervalMs: 5 });
    const runMaintenance = vi.spyOn(
      atomicFs as unknown as { runMaintenance: () => Promise<string> },
      "runMaintenance",
    );
    await pg.exec("CREATE TABLE t (v int)");
    await vi.waitFor(() => expect(runMaintenance).toHaveBeenCalled());
    await pg.close();
    expect(atomicFs["maintenanceTimer"]).toBeUndefined();
    expect(atomicFs["maintenanceInFlight"]).toBeUndefined();
    const calls = runMaintenance.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(runMaintenance).toHaveBeenCalledTimes(calls);
  });
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
