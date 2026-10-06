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

  it("hands the lease on when session recovery itself throws", async () => {
    const pg = new PGlite();
    await pg.waitReady;
    const client: PGliteSession = {
      query: (text: string, params?: unknown[]) => pg.query(text, params),
      exec: (text: string) => pg.exec(text),
      isInTransaction: () => {
        throw new TypeError("isInTransaction is not a function");
      },
    };
    const db = new Kysely<Schema>({
      dialect: new HardenedPGliteDialect(client, {
        onDiagnostic: () => undefined,
      }),
    });
    open.push({ db, pg });

    const settle = (query: Promise<unknown>) =>
      Promise.race([
        query.then(
          () => "resolved",
          (error: unknown) => error,
        ),
        new Promise((resolve) => setTimeout(() => resolve("hung"), 1000)),
      ]);

    await expect(settle(sql`select 1 / 0`.execute(db))).resolves.not.toBe(
      "hung",
    );
    await expect(
      settle(sql`select 1 as x`.execute(db)),
    ).resolves.toBeInstanceOf(PGliteSessionPoisonedError);
    await expect(
      settle(sql`select 1 as x`.execute(db)),
    ).resolves.toBeInstanceOf(PGliteSessionPoisonedError);
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

type LockedSession = {
  session: PGliteSession;
  /** The next matching call takes the lock and never settles, like a dead wasm call. */
  kill: (pattern: RegExp | undefined) => void;
  /** Matching calls hold the lock for `delayMs` first, like a slow call over a worker proxy. */
  slow: (pattern: RegExp | undefined, delayMs: number) => void;
  /** Rejects the dead call late and frees the lock. */
  revive: () => void;
  /** Calls the dialect has issued so far. */
  issued: () => number;
};

/** Every call runs under one FIFO lock, as PGlite's own query and exec do. */
function lockedSession(pg: PGlite): LockedSession {
  let killPattern: RegExp | undefined = undefined;
  let slowPattern: RegExp | undefined = undefined;
  let slowDelayMs = 0;
  let issued = 0;
  let dead: ((error: unknown) => void) | undefined = undefined;
  let lock: Promise<unknown> = Promise.resolve();

  function run<T>(text: string, call: () => Promise<T>): Promise<T> {
    issued += 1;
    const result = lock.then((): Promise<T> => {
      if (killPattern?.test(text)) {
        killPattern = undefined;
        return new Promise<T>((_resolve, reject) => {
          dead = reject;
        });
      }
      if (slowPattern?.test(text)) {
        return new Promise<void>((resolve) =>
          setTimeout(resolve, slowDelayMs),
        ).then(call);
      }
      return call();
    });
    lock = result.catch(() => undefined);
    return result;
  }

  return {
    session: {
      query: (text: string, params?: unknown[]) =>
        run(text, () => pg.query(text, params)),
      exec: (text: string) => run(text, () => pg.exec(text)),
      isInTransaction: () => pg.isInTransaction(),
    },
    kill: (pattern) => {
      killPattern = pattern;
    },
    slow: (pattern, delayMs) => {
      slowPattern = pattern;
      slowDelayMs = delayMs;
    },
    revive: () => {
      dead?.(new Error("LATE-SETTLEMENT"));
      dead = undefined;
    },
    issued: () => issued,
  };
}

/** Fails within `withinMs` and issues no SQL, because the session is known dead. */
async function expectFastRefusal(
  db: Kysely<Schema>,
  locked: LockedSession,
  withinMs = 100,
): Promise<void> {
  const before = locked.issued();
  const startedAt = Date.now();
  await expect(sql`select 1 as x`.execute(db)).rejects.toThrow(
    PGliteSessionPoisonedError,
  );
  expect(Date.now() - startedAt).toBeLessThan(withinMs);
  expect(locked.issued()).toBe(before);
}

describe("HardenedPGliteDialect statement deadline", () => {
  const STATEMENT_TIMEOUT_MS = 60;

  async function deadlinedDb(
    overrides: {
      statementTimeoutMs?: number;
      onDiagnostic?: (message: string) => void;
    } = {},
  ): Promise<{ pg: PGlite; db: Kysely<Schema>; locked: LockedSession }> {
    const pg = new PGlite();
    await pg.waitReady;
    await pg.query("create table t (id int primary key)");
    const locked = lockedSession(pg);
    const db = new Kysely<Schema>({
      dialect: new HardenedPGliteDialect(locked.session, {
        statementTimeoutMs:
          overrides.statementTimeoutMs ?? STATEMENT_TIMEOUT_MS,
        recoveryTimeoutMs: 500,
        onDiagnostic: overrides.onDiagnostic ?? (() => undefined),
      }),
    });
    open.push({ db, pg });
    return { pg, db, locked };
  }

  it("lets a long synchronous statement finish instead of killing it", async () => {
    const pg = new PGlite();
    await pg.waitReady;
    const db = new Kysely<Schema>({
      dialect: new HardenedPGliteDialect(pg, {
        statementTimeoutMs: 200,
        onDiagnostic: () => undefined,
      }),
    });
    open.push({ db, pg });
    await sql`create table t (id int primary key)`.execute(db);

    await sql`insert into t (id) select 1 from pg_sleep(1)`.execute(db);
    await expect(
      db.transaction().execute(async (trx) => {
        await sql`insert into t (id) select 2 from pg_sleep(1)`.execute(trx);
        return "ok";
      }),
    ).resolves.toBe("ok");

    const rows = await sql<Row>`select id from t order by id`.execute(db);
    expect(rows.rows).toEqual([{ id: 1 }, { id: 2 }]);
  }, 10_000);

  it("fails a never-settling statement and refuses the session without issuing more SQL", async () => {
    const { db, locked } = await deadlinedDb();

    locked.kill(/^select id from t/i);
    const hung = await sql<Row>`select id from t`.execute(db).then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(hung).toBeInstanceOf(PGliteSessionPoisonedError);
    expect((hung as PGliteSessionPoisonedError).cause).toBeInstanceOf(
      PGliteStatementTimeoutError,
    );
    await expectFastRefusal(db, locked);
    await expectFastRefusal(db, locked);
  });

  it("ignores the late settlement of an abandoned statement", async () => {
    const diagnostics: string[] = [];
    const { db, locked } = await deadlinedDb({
      onDiagnostic: (message) => diagnostics.push(message),
    });

    locked.kill(/^insert into t/i);
    await expect(
      sql`insert into t (id) values (1)`.execute(db),
    ).rejects.toThrow(PGliteSessionPoisonedError);

    locked.revive();
    await new Promise((resolve) => setTimeout(resolve, 10));

    await expectFastRefusal(db, locked);
    expect(
      diagnostics.filter((message) => message.includes("never settled")),
    ).toHaveLength(1);
  });

  it("does not fire on a slow statement that settles, or on a long transaction", async () => {
    const diagnostics: string[] = [];
    const { db, locked } = await deadlinedDb({
      statementTimeoutMs: 400,
      onDiagnostic: (message) => diagnostics.push(message),
    });

    locked.slow(/^insert into t/i, 120);
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

  it("fails fast after a COMMIT that never settles", async () => {
    const { db, locked } = await deadlinedDb();

    locked.kill(/__commit_guard/);
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

    expect(outcome).toBeInstanceOf(PGliteSessionPoisonedError);
    await expectFastRefusal(db, locked);
  }, 10_000);

  it("fails fast after a ROLLBACK that never settles, keeping the job's error", async () => {
    const { db, locked } = await deadlinedDb();

    locked.kill(/^\s*rollback/i);
    const startedAt = Date.now();
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
    expect(Date.now() - startedAt).toBeLessThan(400);

    await expectFastRefusal(db, locked);
  }, 10_000);

  it("bounds the BEGIN retried after an aborted-transaction recovery", async () => {
    const pg = new PGlite();
    await pg.waitReady;
    let begins = 0;
    let issued = 0;
    const session: PGliteSession = {
      query: (text: string, params?: unknown[]) => {
        issued += 1;
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
      exec: (text: string) => {
        issued += 1;
        return pg.exec(text);
      },
      isInTransaction: () => false,
    };
    const db = new Kysely<Schema>({
      dialect: new HardenedPGliteDialect(session, {
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

    const before = issued;
    await expect(sql`select 1 as x`.execute(db)).rejects.toThrow(
      PGliteSessionPoisonedError,
    );
    expect(issued).toBe(before);
  }, 10_000);
});
