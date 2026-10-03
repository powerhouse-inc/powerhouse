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
  /**
   * Mechanism A-3: the inspector's `queryDb` used to call `pg.query` on the
   * raw client, which enters neither the dialect's queue nor any transaction
   * boundary - so it read a job's uncommitted rows, and an erroring statement
   * typed into the DB explorer aborted whatever job transaction was open.
   * Routed through the dialect it waits for the lease like every other
   * statement, so it can only ever see committed state.
   */
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

  /**
   * Mechanism A-1 and the latent `.stream()` leak of A-4 both end with the
   * single lease held by something that will never give it back. Upstream's
   * driver parks every later caller on an in-memory queue with no bound, so
   * the whole reactor goes quiet with nothing in the logs. The wait is now
   * bounded and the error names the cause.
   */
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

  /**
   * A waiter that gave up must not take the queue with it: upstream hands the
   * lease to the head of its queue on release, so an abandoned resolver would
   * park the lease on an owner that is no longer listening and wedge every
   * caller behind it - converting a bounded failure back into a permanent one.
   */
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

  /**
   * The stuck-portal shape: nothing can end the transaction, in either
   * protocol. The session must then be refused, naming the original failure,
   * rather than handed to the next caller as though it were usable - which is
   * what left all four live channels reporting green while storage was dead.
   */
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

    // The job's own failure is what the caller sees, not the rollback's.
    expect(outcome).toContain("JOB-FAILED");

    // And the dead session is refused rather than reused, with the cause.
    const next = await sql`select 1 as x`.execute(db).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(next).toBeInstanceOf(PGliteSessionPoisonedError);
    expect((next as Error).message).toContain("cannot drop active portal");

    // Once the fault clears, the session heals itself on the next acquire.
    blockRollback.value = false;
    const healed = await sql<{ x: number }>`select 1 as x`.execute(db);
    expect(healed.rows).toEqual([{ x: 1 }]);
    await pg.close();
  });

  /** The happy path must stay a real commit, and cost no extra statements. */
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
