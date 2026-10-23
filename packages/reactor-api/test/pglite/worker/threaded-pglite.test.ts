import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  PGliteWorkerClosedError,
  PGliteWorkerExitedError,
  PGliteWorkerInitError,
} from "../../../src/pglite/worker/errors.js";
import {
  DEFAULT_PGLITE_WORKER_MEMORY_MB,
  resolvePgliteWorkerMemoryMb,
  type ThreadedPGlite,
} from "../../../src/pglite/worker/threaded-pglite.js";
import {
  BOOT_TIMEOUT_MS,
  memoryStore,
  startThreadedPGlite,
} from "./helpers.js";

describe("ThreadedPGlite against a real worker", () => {
  let pg: ThreadedPGlite;

  beforeAll(async () => {
    pg = startThreadedPGlite({ memoryLimitMb: 512 });
    await pg.waitReady;
  }, BOOT_TIMEOUT_MS);

  afterAll(async () => {
    await pg.close();
  });

  it("is ready after waitReady and passes the memory limit to the Worker", () => {
    expect(pg.ready).toBe(true);
    expect(pg.closed).toBe(false);
    expect(pg.resourceLimits.maxOldGenerationSizeMb).toBe(512);
  });

  it("runs concurrent query and exec calls in arrival order", async () => {
    await pg.exec(
      "create table ordering (seq serial primary key, value int not null)",
    );
    const calls: Promise<unknown>[] = [];
    for (let i = 0; i < 200; i++) {
      calls.push(
        i % 3 === 0
          ? pg.exec(`insert into ordering (value) values (${i})`)
          : pg.query("insert into ordering (value) values ($1)", [i]),
      );
    }
    await Promise.all(calls);
    const { rows } = await pg.query<{ value: number }>(
      "select value from ordering order by seq",
    );
    expect(rows.map((row) => row.value)).toEqual(
      Array.from({ length: 200 }, (_, i) => i),
    );
  });

  it("keeps a SQL transaction on the one connection until it ends", async () => {
    await pg.exec("create table tx_hold (v int)");
    const begin = pg.query("begin");
    const insert = pg.query("insert into tx_hold values (1)");
    const peek = pg.query<{ n: number }>(
      "select count(*)::int as n from tx_hold",
    );
    const rollback = pg.query("rollback");
    const after = pg.query<{ n: number }>(
      "select count(*)::int as n from tx_hold",
    );
    await Promise.all([begin, insert, rollback]);
    expect((await peek).rows[0].n).toBe(1);
    expect((await after).rows[0].n).toBe(0);
  });

  it("reports isInTransaction from every answer, including failed statements", async () => {
    expect(pg.isInTransaction()).toBe(false);
    await pg.query("begin");
    expect(pg.isInTransaction()).toBe(true);
    await expect(pg.query("select 1/0")).rejects.toMatchObject({
      code: "22012",
    });
    expect(pg.isInTransaction()).toBe(true);
    await expect(pg.query("select 1")).rejects.toMatchObject({
      code: "25P02",
    });
    expect(pg.isInTransaction()).toBe(true);
    await pg.exec("rollback");
    expect(pg.isInTransaction()).toBe(false);
    await pg.exec("begin; select 1;");
    expect(pg.isInTransaction()).toBe(true);
    await pg.exec("commit");
    expect(pg.isInTransaction()).toBe(false);
  });

  it("re-creates Postgres errors with their fields", async () => {
    await pg.exec(
      "create table uniq (id int constraint uniq_pk primary key, label text)",
    );
    await pg.query("insert into uniq values (1, 'a')");
    const error = await pg.query("insert into uniq values (1, 'b')").then(
      () => null,
      (err: unknown) => err,
    );
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      code: "23505",
      severity: "ERROR",
      constraint: "uniq_pk",
      table: "uniq",
      schema: "public",
      detail: "Key (id)=(1) already exists.",
    });
    expect((error as Error).message).toContain("duplicate key");
    expect(typeof (error as Error).stack).toBe("string");

    const syntax = await pg.query("select * fromm uniq").then(
      () => null,
      (err: unknown) => err,
    );
    expect(syntax).toMatchObject({ code: "42601", position: "10" });
  });

  it("parses timestamp without time zone as UTC with the utc-timestamps preset", async () => {
    const { rows } = await pg.query<{ ts: Date; tz: Date }>(
      "select '2024-01-02 03:04:05.678'::timestamp as ts, '2024-01-02 03:04:05+02'::timestamptz as tz",
    );
    expect(rows[0].ts).toBeInstanceOf(Date);
    expect(rows[0].ts.toISOString()).toBe("2024-01-02T03:04:05.678Z");
    expect(rows[0].tz.toISOString()).toBe("2024-01-02T01:04:05.000Z");
  });

  it("round-trips JSON and bytea", async () => {
    await pg.exec("create table blobs (doc jsonb, raw bytea, at timestamp)");
    const doc = { a: 1, nested: { list: [1, "two", null], ok: true } };
    const raw = new Uint8Array([0, 1, 2, 254, 255]);
    const at = new Date("2025-06-07T08:09:10.000Z");
    await pg.query("insert into blobs values ($1, $2, $3)", [doc, raw, at]);
    const { rows, fields } = await pg.query<{
      doc: unknown;
      raw: Uint8Array;
      at: Date;
    }>("select doc, raw, at from blobs");
    expect(rows[0].doc).toEqual(doc);
    expect(rows[0].raw).toBeInstanceOf(Uint8Array);
    expect([...rows[0].raw]).toEqual([...raw]);
    expect(rows[0].at.toISOString()).toBe(at.toISOString());
    expect(fields.map((field) => field.name)).toEqual(["doc", "raw", "at"]);
  });

  it("returns affectedRows and supports rowMode array", async () => {
    await pg.exec("create table counted (v int)");
    const inserted = await pg.query(
      "insert into counted select generate_series(1, 7)",
    );
    expect(inserted.affectedRows).toBe(7);
    const { rows } = await pg.query("select 1 as a, 2 as b", [], {
      rowMode: "array",
    });
    expect(rows).toEqual([[1, 2]]);
  });

  it("rejects per-query options that cannot cross the thread", async () => {
    await expect(
      pg.query("select 1", [], { parsers: { 23: (v: string) => v } }),
    ).rejects.toThrow(/parsers/);
  });

  it("returns a 50k-row result", async () => {
    const sql =
      "select g as id, md5(g::text) as hash, now() as at from generate_series(1, 50000) g";
    await pg.query(sql);
    const started = performance.now();
    const { rows } = await pg.query<{ id: number; hash: string }>(sql);
    const workerMs = performance.now() - started;
    expect(rows).toHaveLength(50_000);
    expect(rows[49_999].id).toBe(50_000);

    const local = new PGlite();
    await local.waitReady;
    await local.query(sql);
    const localStarted = performance.now();
    await local.query(sql);
    const localMs = performance.now() - localStarted;
    await local.close();
    console.info(
      `50k rows: worker ${workerMs.toFixed(0)} ms, in-thread ${localMs.toFixed(0)} ms`,
    );
  }, 60_000);
});

describe("ThreadedPGlite lifecycle", () => {
  it(
    "closes PGlite, then the thread, and refuses later calls",
    async () => {
      vi.stubEnv("PH_PGLITE_WORKER_MEMORY_MB", "384");
      let pg: ThreadedPGlite;
      try {
        pg = startThreadedPGlite();
      } finally {
        vi.unstubAllEnvs();
      }
      const exits: (Error | null)[] = [];
      pg.onExit((error) => exits.push(error));
      expect(pg.resourceLimits.maxOldGenerationSizeMb).toBe(384);
      const early = pg.query<{ v: number }>("select 1 as v");
      await pg.waitReady;
      expect((await early).rows[0].v).toBe(1);

      const queued = pg.query<{ v: number }>("select 2 as v");
      const closing = pg.close();
      expect(pg.closed).toBe(true);
      expect((await queued).rows[0].v).toBe(2);
      await closing;
      await expect(pg.query("select 1")).rejects.toBeInstanceOf(
        PGliteWorkerClosedError,
      );
      expect(exits).toEqual([null]);
      await pg.close();
    },
    BOOT_TIMEOUT_MS,
  );

  it(
    "rejects pending calls with a typed error when the thread dies",
    async () => {
      const pg = startThreadedPGlite();
      await pg.waitReady;
      const exits: (Error | null)[] = [];
      pg.onExit((error) => exits.push(error));
      const sleeping = pg.query("select pg_sleep(5)");
      const queued = pg.query("select 1");
      await new Promise((resolve) => setTimeout(resolve, 100));
      await pg.terminate();
      await expect(sleeping).rejects.toBeInstanceOf(PGliteWorkerExitedError);
      await expect(queued).rejects.toBeInstanceOf(PGliteWorkerExitedError);
      expect(pg.closed).toBe(true);
      expect(exits).toHaveLength(1);
      expect(exits[0]).toBeInstanceOf(PGliteWorkerExitedError);
      await expect(pg.query("select 1")).rejects.toBeInstanceOf(
        PGliteWorkerExitedError,
      );
      await pg.close();
    },
    BOOT_TIMEOUT_MS,
  );

  it(
    "fails waitReady and every call when the store cannot open",
    async () => {
      const pg = startThreadedPGlite({
        store: memoryStore({
          module: { pglite: "ph-no-such-pglite", nodefs: "ph-no-such-nodefs" },
        }),
      });
      const call = pg.query("select 1");
      await expect(pg.waitReady).rejects.toBeInstanceOf(PGliteWorkerInitError);
      await expect(call).rejects.toBeInstanceOf(PGliteWorkerInitError);
      const error = await pg.waitReady.then(
        () => null,
        (err: unknown) => err as Error,
      );
      expect(String(error?.cause)).toMatch(/ph-no-such-pglite/);
      await pg.close();
      expect(pg.closed).toBe(true);
    },
    BOOT_TIMEOUT_MS,
  );
});

describe("resolvePgliteWorkerMemoryMb", () => {
  it("defaults, reads the env and rejects junk", () => {
    expect(resolvePgliteWorkerMemoryMb({})).toBe(
      DEFAULT_PGLITE_WORKER_MEMORY_MB,
    );
    expect(DEFAULT_PGLITE_WORKER_MEMORY_MB).toBe(1024);
    expect(
      resolvePgliteWorkerMemoryMb({ PH_PGLITE_WORKER_MEMORY_MB: "2048" }),
    ).toBe(2048);
    expect(() =>
      resolvePgliteWorkerMemoryMb({ PH_PGLITE_WORKER_MEMORY_MB: "lots" }),
    ).toThrow(/PH_PGLITE_WORKER_MEMORY_MB/);
  });
});
