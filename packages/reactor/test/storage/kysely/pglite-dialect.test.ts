import { PGlite } from "@electric-sql/pglite";
import { Kysely, sql } from "kysely";
import { afterEach, describe, expect, it } from "vitest";
import {
  HardenedPGliteDialect,
  PGliteAcquireTimeoutError,
  PGliteSessionPoisonedError,
  queryThroughDialect,
  type PGliteSession,
} from "../../../src/storage/kysely/pglite-dialect.js";

type Row = { id: number };
type Schema = { t: Row };

const ACQUIRE_TIMEOUT_MS = 250;

let open: Array<{ db: Kysely<Schema>; pg: PGlite }> = [];

async function freshDb(
  client?: PGliteSession,
  acquireTimeoutMs = ACQUIRE_TIMEOUT_MS,
): Promise<{ pg: PGlite; db: Kysely<Schema> }> {
  const pg = new PGlite();
  await pg.waitReady;
  const db = new Kysely<Schema>({
    dialect: new HardenedPGliteDialect(client ?? pg, {
      acquireTimeoutMs,
      onDiagnostic: () => undefined,
    }),
  });
  await sql`create table t (id int primary key)`.execute(db);
  open.push({ db, pg });
  return { pg, db };
}

afterEach(async () => {
  const toClose = open;
  open = [];
  for (const { pg } of toClose) {
    await pg.close().catch(() => undefined);
  }
});

describe("HardenedPGliteDialect", () => {
  it("serialises a raw inspector query behind an open transaction", async () => {
    const { db } = await freshDb();

    let inspected: unknown[] | undefined;
    const transaction = db.transaction().execute(async (trx) => {
      await sql`insert into t (id) values (1)`.execute(trx);
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(inspected).toBeUndefined();
      return "committed";
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    const inspection = queryThroughDialect(db, "select id from t").then(
      (rows) => {
        inspected = rows;
        return rows;
      },
    );

    await expect(transaction).resolves.toBe("committed");
    await expect(inspection).resolves.toEqual([{ id: 1 }]);
  });

  it("fails loudly instead of hanging when the lease is never returned", async () => {
    const { db } = await freshDb();
    await sql`insert into t select generate_series(1, 100)`.execute(db);

    const iterator = db
      .selectFrom("t")
      .selectAll()
      .stream(10)
      [Symbol.asyncIterator]();
    await iterator.next();

    await expect(sql`select 1 as x`.execute(db)).rejects.toThrow(
      PGliteAcquireTimeoutError,
    );
  });

  it("hands the lease on after a waiter times out", async () => {
    const { db } = await freshDb();

    const holder = db.transaction().execute(async (trx) => {
      await sql`insert into t (id) values (1)`.execute(trx);
      await new Promise((resolve) => setTimeout(resolve, 600));
      return "held";
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    await expect(sql`select 1 as x`.execute(db)).rejects.toThrow(
      PGliteAcquireTimeoutError,
    );
    await expect(holder).resolves.toBe("held");

    const after = await sql<{ x: number }>`select 1 as x`.execute(db);
    expect(after.rows).toEqual([{ x: 1 }]);
  });

  it("refuses a session no rollback can clear, naming the original error", async () => {
    const pg = new PGlite();
    await pg.waitReady;
    await pg.query("create table t (id int primary key)");

    const blockRollback = { value: false };
    const client: PGliteSession = {
      query: (text: string, params?: unknown[]) => {
        if (blockRollback.value && /^\s*rollback/i.test(text)) {
          return Promise.reject(new Error('cannot drop active portal ""'));
        }
        return pg.query(text, params);
      },
      exec: (text: string) => {
        if (blockRollback.value && /^\s*rollback/i.test(text)) {
          return Promise.reject(new Error('cannot drop active portal ""'));
        }
        return pg.exec(text);
      },
      isInTransaction: () => pg.isInTransaction(),
    };
    const db = new Kysely<Schema>({
      dialect: new HardenedPGliteDialect(client, {
        acquireTimeoutMs: ACQUIRE_TIMEOUT_MS,
        onDiagnostic: () => undefined,
      }),
    });

    blockRollback.value = true;
    const outcome = await db
      .transaction()
      .execute(async (trx) => {
        await sql`insert into t (id) values (1)`.execute(trx);
        throw new Error("JOB-FAILED");
      })
      .then(
        () => "resolved",
        (error: Error) => error.message,
      );

    expect(outcome).toContain("JOB-FAILED");

    const next = await sql`select 1 as x`.execute(db).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(next).toBeInstanceOf(PGliteSessionPoisonedError);
    expect((next as Error).message).toContain("cannot drop active portal");

    blockRollback.value = false;
    const healed = await sql<{ x: number }>`select 1 as x`.execute(db);
    expect(healed.rows).toEqual([{ x: 1 }]);
    await pg.close();
  });

  it("never replays a failed statement as its own autocommit statement", async () => {
    const { pg, db } = await freshDb();

    await pg.query("BEGIN");
    await pg.query("select 1 / 0").catch(() => undefined);
    expect(pg.isInTransaction()).toBe(true);

    const write = await sql`insert into t (id) values (42)`.execute(db).then(
      () => "committed",
      (error: Error) => error.message,
    );
    expect(write).toContain("current transaction is aborted");

    const rows = await sql<Row>`select id from t`.execute(db);
    expect(rows.rows).toEqual([]);
  });

  it("commits a healthy transaction", async () => {
    const { db } = await freshDb();

    await expect(
      db.transaction().execute(async (trx) => {
        await sql`insert into t (id) values (7)`.execute(trx);
        return "ok";
      }),
    ).resolves.toBe("ok");

    const rows = await sql<Row>`select id from t`.execute(db);
    expect(rows.rows).toEqual([{ id: 7 }]);
  });
});
