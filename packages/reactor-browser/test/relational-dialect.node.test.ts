import { PGlite } from "@electric-sql/pglite";
import { Kysely, sql } from "kysely";
import { afterEach, describe, expect, it } from "vitest";
import {
  relationalDialect,
  relationalKysely,
  subscribeRelationalPoisoned,
} from "../src/relational/utils/relational-dialect.js";

type Schema = { t: { id: number } };

const opened: PGlite[] = [];

afterEach(async () => {
  for (const pg of opened.splice(0)) {
    await pg.close().catch(() => undefined);
  }
});

describe("relationalDialect", () => {
  it("refuses a commit of an aborted transaction on a real PGlite", async () => {
    const pg = new PGlite();
    opened.push(pg);
    const db = new Kysely<Schema>({ dialect: relationalDialect(pg) });
    await sql`create table t (id int primary key)`.execute(db);

    const outcome = await db
      .transaction()
      .execute(async (trx) => {
        await sql`insert into t (id) values (1)`.execute(trx);
        await sql`select 1 / 0`.execute(trx).catch(() => undefined);
        return "committed";
      })
      .catch(() => "refused");

    expect(outcome).toBe("refused");
    const rows = await sql`select id from t`.execute(db);
    expect(rows.rows).toEqual([]);
  });

  it("runs statements over a query-only proxy, which has no session to harden", async () => {
    const pg = new PGlite();
    opened.push(pg);
    const proxy = {
      query: (text: string, params?: unknown[]) => pg.query(text, params),
      live: {},
    };
    const db = new Kysely<Schema>({ dialect: relationalDialect(proxy) });

    const rows = await sql<{ x: number }>`select 1 as x`.execute(db);
    expect(rows.rows).toEqual([{ x: 1 }]);
  });

  it("gives every consumer of one PGlite the same queue, so one cannot end another's transaction", async () => {
    const pg = new PGlite();
    opened.push(pg);
    const first = relationalKysely<Schema>(pg);
    const second = relationalKysely<Schema>(pg);
    await sql`create table t (id int primary key)`.execute(first);

    const transaction = first.transaction().execute(async (trx) => {
      await sql`insert into t (id) values (1)`.execute(trx);
      await new Promise((resolve) => setTimeout(resolve, 50));
      return "committed";
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    await sql`select 1 / 0`.execute(second).catch(() => undefined);

    await expect(transaction).resolves.toBe("committed");
    const rows = await sql`select id from t`.execute(first);
    expect(rows.rows).toEqual([{ id: 1 }]);
  });

  function deadSession() {
    const pg = new PGlite();
    opened.push(pg);
    return {
      query: (text: string, params?: unknown[]) =>
        /dead_call/.test(text)
          ? new Promise<never>(() => undefined)
          : pg.query(text, params),
      exec: (text: string) => pg.exec(text),
      isInTransaction: () => pg.isInTransaction(),
    };
  }

  it("tells every subscriber of a PGlite that its session is poisoned, whoever opened it first", async () => {
    const dead = deadSession();
    const db = relationalKysely<Schema>(dead, {
      statementTimeoutMs: 50,
      onDiagnostic: () => undefined,
    });
    const first: Error[] = [];
    const second: Error[] = [];
    subscribeRelationalPoisoned(dead, (cause) => first.push(cause));
    subscribeRelationalPoisoned(dead, (cause) => second.push(cause));

    await expect(sql`select 1 as dead_call`.execute(db)).rejects.toThrow();
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
  });

  it("stops telling a subscriber that unsubscribed, and tells a late one at once", async () => {
    const dead = deadSession();
    const db = relationalKysely<Schema>(dead, {
      statementTimeoutMs: 50,
      onDiagnostic: () => undefined,
    });
    const gone: Error[] = [];
    const unsubscribe = subscribeRelationalPoisoned(dead, (cause) =>
      gone.push(cause),
    );
    unsubscribe();

    await expect(sql`select 1 as dead_call`.execute(db)).rejects.toThrow();
    expect(gone).toEqual([]);

    const late: Error[] = [];
    subscribeRelationalPoisoned(dead, (cause) => late.push(cause));
    expect(late).toHaveLength(1);
  });
});
