import { PGlite } from "@electric-sql/pglite";
import { Kysely, sql } from "kysely";
import { afterEach, describe, expect, it } from "vitest";
import {
  HardenedPGliteDialect,
  isLongRunningStatement,
  PGliteAcquireTimeoutError,
  PGliteSessionPoisonedError,
  PGliteStatementTimeoutError,
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

  /**
   * The dialect cannot know whose transaction the shared session is in: its
   * own `transactionOpen` flag is set only by `beginTransaction`, while any
   * statement reaching the queue - the inspector's `queryThroughDialect`, a
   * migration, a processor - may have opened one with a raw `BEGIN`. So a
   * statement that failed with `25P02` is never replayed after the session is
   * reset: replaying it would run a write meant to be atomic with that
   * transaction on its own autocommit statement, committing it alone.
   */
  it("never replays a failed statement as its own autocommit statement", async () => {
    const { pg, db } = await freshDb();

    // A transaction opened outside this driver, then aborted - exactly what an
    // inspector session or any other consumer of the shared session can do.
    await pg.query("BEGIN");
    await pg.query("select 1 / 0").catch(() => undefined);
    expect(pg.isInTransaction()).toBe(true);

    const write = await sql`insert into t (id) values (42)`.execute(db).then(
      () => "committed",
      (error: Error) => error.message,
    );
    expect(write).toContain("current transaction is aborted");

    // The statement must not have landed standalone, and the session must be
    // usable again for the next caller.
    const rows = await sql<Row>`select id from t`.execute(db);
    expect(rows.rows).toEqual([]);
  });

  it("classifies maintenance and DDL as long-running, reads and writes as not", () => {
    for (const statement of [
      "vacuum full reactor.operations",
      "  ANALYZE reactor.operations",
      "create index idx on t (id)",
      "alter table t add column x int",
      "drop table t",
      "checkpoint",
      "truncate t",
    ]) {
      expect(isLongRunningStatement(statement)).toBe(true);
    }
    for (const statement of [
      "select id from t",
      "insert into t (id) values (1)",
      "update t set id = 2",
      "delete from t",
      "begin",
      "select 1 as __commit_guard; commit",
    ]) {
      expect(isLongRunningStatement(statement)).toBe(false);
    }
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

/** A session whose chosen statements never settle, like a dead wasm call. */
type HangingSession = {
  session: PGliteSession;
  /** Statements matching this neither resolve nor reject. */
  setHang: (pattern: RegExp | undefined) => void;
  /** How many calls are currently abandoned mid-flight. */
  abandonedCount: () => number;
  /** Settles every abandoned call, late, the way a revived wasm call would. */
  settleAbandoned: (outcome: "resolve" | "reject") => void;
  /** Statements matching this resolve only after `delayMs`. */
  setSlow: (pattern: RegExp | undefined, delayMs: number) => void;
};

function hangingSession(pg: PGlite): HangingSession {
  let hang: RegExp | undefined = undefined;
  let slow: RegExp | undefined = undefined;
  let slowDelayMs = 0;
  const abandoned: Array<{
    resolve: (value: never) => void;
    reject: (error: unknown) => void;
  }> = [];

  function intercept<T>(text: string, run: () => Promise<T>): Promise<T> {
    if (hang?.test(text)) {
      return new Promise<T>((resolve, reject) => {
        abandoned.push({ resolve: resolve as (value: never) => void, reject });
      });
    }
    if (slow?.test(text)) {
      return new Promise<T>((resolve, reject) => {
        setTimeout(() => {
          run().then(resolve, reject);
        }, slowDelayMs);
      });
    }
    return run();
  }

  return {
    session: {
      query: (text: string, params?: unknown[]) =>
        intercept(text, () => pg.query(text, params)),
      exec: (text: string) => intercept(text, () => pg.exec(text)),
      isInTransaction: () => pg.isInTransaction(),
    },
    setHang: (pattern) => {
      hang = pattern;
    },
    abandonedCount: () => abandoned.length,
    settleAbandoned: (outcome) => {
      const taken = abandoned.splice(0, abandoned.length);
      for (const call of taken) {
        if (outcome === "reject") {
          call.reject(new Error("LATE-SETTLEMENT"));
        } else {
          call.resolve({ rows: [] } as never);
        }
      }
    },
    setSlow: (pattern, delayMs) => {
      slow = pattern;
      slowDelayMs = delayMs;
    },
  };
}

/**
 * Regression run 3, finding B: the silent statement hang.
 *
 * A PGlite statement whose wasm internals die mid-call raises no error and
 * never settles. The lease is never released, `acquireTimeoutMs` bounds only
 * the waiters, and the self-heal needs an error - so the worker went to 0% CPU
 * with every RPC dead and nothing in any log. These assert the deadline that
 * turns that into a recreate.
 */
describe("HardenedPGliteDialect statement deadline", () => {
  const STATEMENT_TIMEOUT_MS = 60;

  async function deadlinedDb(
    onPoisoned: (cause: unknown) => Promise<boolean>,
    overrides: {
      statementTimeoutMs?: number;
      longStatementTimeoutMs?: number;
    } = {},
  ): Promise<{ pg: PGlite; db: Kysely<Schema>; hanging: HangingSession }> {
    const pg = new PGlite();
    await pg.waitReady;
    await pg.query("create table t (id int primary key)");
    const hanging = hangingSession(pg);
    const db = new Kysely<Schema>({
      dialect: new HardenedPGliteDialect(hanging.session, {
        acquireTimeoutMs: 2_000,
        statementTimeoutMs:
          overrides.statementTimeoutMs ?? STATEMENT_TIMEOUT_MS,
        longStatementTimeoutMs: overrides.longStatementTimeoutMs ?? 2_000,
        recoveryTimeoutMs: 500,
        onDiagnostic: () => undefined,
        onPoisoned,
      }),
    });
    open.push({ db, pg });
    return { pg, db, hanging };
  }

  /**
   * One hung statement must produce exactly one poison report - not one per
   * release-time recovery attempt and not one more when the abandoned call
   * eventually settles - and the session must be usable immediately after the
   * self-heal answers that it replaced the instance.
   */
  it("reports a never-settling statement to the poison path exactly once", async () => {
    let poisonCalls = 0;
    const { db, hanging } = await deadlinedDb(() => {
      poisonCalls += 1;
      hanging.setHang(undefined);
      return Promise.resolve(true);
    });

    hanging.setHang(/^select id from t/i);
    const hung = await sql<Row>`select id from t`.execute(db).then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(hung).toBeInstanceOf(PGliteStatementTimeoutError);
    expect(poisonCalls).toBe(1);
    expect(hanging.abandonedCount()).toBe(1);

    const healthy = await sql<Row>`select id from t`.execute(db);
    expect(healthy.rows).toEqual([]);
    expect(poisonCalls).toBe(1);
  });

  /**
   * The wasm call cannot be aborted, so the timed-out call is abandoned, not
   * cancelled. Its late settlement - with rows, or with an error - must not
   * reach the state of the instance that replaced it: the generation guard
   * drops it, so it neither marks the fresh connection suspect nor reports a
   * second poison.
   */
  it("discards the late settlement of an abandoned statement", async () => {
    let poisonCalls = 0;
    const { db, hanging } = await deadlinedDb(() => {
      poisonCalls += 1;
      hanging.setHang(undefined);
      return Promise.resolve(true);
    });

    hanging.setHang(/^insert into t/i);
    await expect(
      sql`insert into t (id) values (1)`.execute(db),
    ).rejects.toThrow(PGliteStatementTimeoutError);

    hanging.settleAbandoned("reject");
    await new Promise((resolve) => setTimeout(resolve, 10));

    const after = await sql<Row>`select id from t`.execute(db);
    expect(after.rows).toEqual([]);
    expect(poisonCalls).toBe(1);

    await sql`insert into t (id) values (2)`.execute(db);
    const final = await sql<Row>`select id from t`.execute(db);
    expect(final.rows).toEqual([{ id: 2 }]);
  });

  /**
   * The recreate is the cure, so it cannot be subject to the thing it cures:
   * a close-then-open that takes far longer than a statement deadline must
   * still be allowed to finish, and the statement that triggered it waits for
   * the answer rather than being failed twice.
   */
  it("exempts the self-heal recreate from the statement deadline", async () => {
    const recreateMs = STATEMENT_TIMEOUT_MS * 5;
    let poisonCalls = 0;
    const { db, hanging } = await deadlinedDb(async () => {
      poisonCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, recreateMs));
      hanging.setHang(undefined);
      return true;
    });

    hanging.setHang(/^select id from t/i);
    const startedAt = Date.now();
    await expect(sql<Row>`select id from t`.execute(db)).rejects.toThrow(
      PGliteStatementTimeoutError,
    );

    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(recreateMs);
    expect(poisonCalls).toBe(1);

    const healthy = await sql<Row>`select id from t`.execute(db);
    expect(healthy.rows).toEqual([]);
  });

  /** No replacement means the loud refusal, exactly as before the deadline. */
  it("refuses the session when the self-heal cannot replace the instance", async () => {
    const { db, hanging } = await deadlinedDb(() => Promise.resolve(false));

    hanging.setHang(/^select id from t/i);
    await expect(sql<Row>`select id from t`.execute(db)).rejects.toThrow(
      PGliteSessionPoisonedError,
    );
  });

  /**
   * The deadline must not become the new silent killer: a statement that is
   * merely slow still settles, and bulk work is a long TRANSACTION of short
   * statements, not one long statement.
   */
  it("does not fire on a slow statement that settles, or on a long transaction", async () => {
    let poisonCalls = 0;
    const { db, hanging } = await deadlinedDb(
      () => {
        poisonCalls += 1;
        return Promise.resolve(false);
      },
      { statementTimeoutMs: 400 },
    );

    hanging.setSlow(/^insert into t/i, 120);
    await expect(
      db.transaction().execute(async (trx) => {
        await sql`insert into t (id) values (1)`.execute(trx);
        await sql`insert into t (id) values (2)`.execute(trx);
        await sql`insert into t (id) values (3)`.execute(trx);
        return "ok";
      }),
    ).resolves.toBe("ok");

    expect(poisonCalls).toBe(0);
    const rows = await sql<Row>`select id from t order by id`.execute(db);
    expect(rows.rows).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
  });

  /**
   * Maintenance and DDL are data-sized, so they get the long bound; a read of
   * the same duration does not.
   */
  it("gives a maintenance statement the long bound and a read the short one", async () => {
    const { db, hanging } = await deadlinedDb(() => Promise.resolve(false), {
      statementTimeoutMs: 40,
      longStatementTimeoutMs: 2_000,
    });

    hanging.setSlow(/^(vacuum|select id from t)/i, 180);
    await expect(queryThroughDialect(db, "vacuum t")).resolves.toEqual([]);
    await expect(sql<Row>`select id from t`.execute(db)).rejects.toThrow(
      PGliteSessionPoisonedError,
    );
  });
});
