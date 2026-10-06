import { PGlite } from "@electric-sql/pglite";
import { Kysely, sql } from "kysely";
import { afterEach, describe, expect, it, vi } from "vitest";
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

  it("lets a waiter wait out a long-held lease by default", async () => {
    const pg = new PGlite();
    await pg.waitReady;
    const db = new Kysely<Schema>({
      dialect: new HardenedPGliteDialect(pg, { onDiagnostic: () => undefined }),
    });
    open.push({ db, pg });
    await sql`create table t (id int primary key)`.execute(db);

    let release = () => undefined as void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const holder = db.transaction().execute(async (trx) => {
        await sql`insert into t (id) values (1)`.execute(trx);
        await held;
        return "held";
      });
      await vi.advanceTimersByTimeAsync(10);
      const waiter = sql<Row>`select id from t`.execute(db).then(
        (result) => result.rows,
        (error: unknown) => error,
      );

      await vi.advanceTimersByTimeAsync(30 * 60_000);
      release();

      await expect(holder).resolves.toBe("held");
      await expect(waiter).resolves.toEqual([{ id: 1 }]);
    } finally {
      vi.useRealTimers();
    }
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

type HangingSession = {
  session: PGliteSession;
  setHang: (pattern: RegExp | undefined) => void;
  abandonedCount: () => number;
  settleAbandoned: (outcome: "resolve" | "reject") => void;
  setSlow: (pattern: RegExp | undefined, delayMs: number) => void;
};

/** A session whose matching statements never settle, like a dead wasm call. */
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

describe("HardenedPGliteDialect statement deadline", () => {
  const STATEMENT_TIMEOUT_MS = 60;

  async function deadlinedDb(
    overrides: {
      statementTimeoutMs?: number;
      longStatementTimeoutMs?: number;
      onDiagnostic?: (message: string) => void;
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
        onDiagnostic: overrides.onDiagnostic ?? (() => undefined),
      }),
    });
    open.push({ db, pg });
    return { pg, db, hanging };
  }

  it("fails a never-settling statement loudly and releases the lease", async () => {
    const { db, hanging } = await deadlinedDb();

    hanging.setHang(/^select id from t/i);
    const hung = await sql<Row>`select id from t`.execute(db).then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(hung).toBeInstanceOf(PGliteSessionPoisonedError);
    expect((hung as PGliteSessionPoisonedError).cause).toBeInstanceOf(
      PGliteStatementTimeoutError,
    );
    expect(hanging.abandonedCount()).toBe(1);

    hanging.setHang(undefined);
    const healthy = await sql<Row>`select id from t`.execute(db);
    expect(healthy.rows).toEqual([]);
  });

  it("discards the late settlement of an abandoned statement", async () => {
    const diagnostics: string[] = [];
    const { db, hanging } = await deadlinedDb({
      onDiagnostic: (message) => diagnostics.push(message),
    });

    hanging.setHang(/^insert into t/i);
    await expect(
      sql`insert into t (id) values (1)`.execute(db),
    ).rejects.toThrow(PGliteSessionPoisonedError);
    hanging.setHang(undefined);

    hanging.settleAbandoned("reject");
    await new Promise((resolve) => setTimeout(resolve, 10));

    const after = await sql<Row>`select id from t`.execute(db);
    expect(after.rows).toEqual([]);

    await sql`insert into t (id) values (2)`.execute(db);
    const final = await sql<Row>`select id from t`.execute(db);
    expect(final.rows).toEqual([{ id: 2 }]);
    expect(
      diagnostics.filter((message) => message.includes("never settled")),
    ).toHaveLength(1);
  });

  it("does not fire on a slow statement that settles, or on a long transaction", async () => {
    const diagnostics: string[] = [];
    const { db, hanging } = await deadlinedDb({
      statementTimeoutMs: 400,
      onDiagnostic: (message) => diagnostics.push(message),
    });

    hanging.setSlow(/^insert into t/i, 120);
    await expect(
      db.transaction().execute(async (trx) => {
        await sql`insert into t (id) values (1)`.execute(trx);
        await sql`insert into t (id) values (2)`.execute(trx);
        await sql`insert into t (id) values (3)`.execute(trx);
        return "ok";
      }),
    ).resolves.toBe("ok");

    expect(diagnostics).toEqual([]);
    const rows = await sql<Row>`select id from t order by id`.execute(db);
    expect(rows.rows).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
  });

  it("gives a maintenance statement the long bound and a read the short one", async () => {
    const { db, hanging } = await deadlinedDb({
      statementTimeoutMs: 40,
      longStatementTimeoutMs: 2_000,
    });

    hanging.setSlow(/^(vacuum|select id from t)/i, 180);
    await expect(queryThroughDialect(db, "vacuum t")).resolves.toEqual([]);
    await expect(sql<Row>`select id from t`.execute(db)).rejects.toThrow(
      PGliteSessionPoisonedError,
    );
  });

  it("bounds a COMMIT that never settles and leaves the session usable", async () => {
    const { db, hanging } = await deadlinedDb();

    hanging.setHang(/__commit_guard/);
    const outcome = await db
      .transaction()
      .execute(async (trx) => {
        await sql`insert into t (id) values (1)`.execute(trx);
        return "ok";
      })
      .then(
        () => undefined,
        (error: unknown) => error,
      );
    hanging.setHang(undefined);

    expect(outcome).toBeInstanceOf(PGliteSessionPoisonedError);
    const rows = await sql<Row>`select id from t`.execute(db);
    expect(rows.rows).toEqual([]);
  }, 10_000);

  it("bounds the BEGIN retried after an aborted-transaction recovery", async () => {
    const pg = new PGlite();
    await pg.waitReady;
    let begins = 0;
    const session: PGliteSession = {
      query: (text: string, params?: unknown[]) => {
        if (/^\s*(begin|start transaction)/i.test(text)) {
          begins += 1;
          if (begins === 1) {
            return Promise.reject(
              new Error(
                "current transaction is aborted, commands ignored until end of transaction block",
              ),
            );
          }
          return new Promise(() => undefined);
        }
        return pg.query(text, params);
      },
      exec: (text: string) => pg.exec(text),
      isInTransaction: () => false,
    };
    const db = new Kysely<Schema>({
      dialect: new HardenedPGliteDialect(session, {
        acquireTimeoutMs: 2_000,
        statementTimeoutMs: 60,
        recoveryTimeoutMs: 500,
        onDiagnostic: () => undefined,
      }),
    });
    open.push({ db, pg });

    const outcome = await db
      .transaction()
      .execute(() => Promise.resolve("never reached"))
      .then(
        () => undefined,
        (error: unknown) => error,
      );

    expect(begins).toBe(2);
    expect(outcome).toBeInstanceOf(PGliteSessionPoisonedError);
  }, 10_000);

  it("bounds the release-time recovery when the session stops answering", async () => {
    const { db, hanging } = await deadlinedDb();

    hanging.setHang(/^\s*rollback|__session_probe/i);
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

    await expect(sql`select 1 as x`.execute(db)).rejects.toThrow(
      PGliteSessionPoisonedError,
    );
  }, 10_000);
});
