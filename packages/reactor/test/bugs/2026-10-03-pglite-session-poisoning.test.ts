import { PGlite } from "@electric-sql/pglite";
import { Kysely, sql } from "kysely";
import { describe, expect, it } from "vitest";
import { HardenedPGliteDialect } from "../../src/storage/kysely/pglite-dialect.js";

type Row = { id: number };
type Schema = { t: Row };

const ACQUIRE_TIMEOUT_MS = 250;

async function freshDb(): Promise<{ pg: PGlite; db: Kysely<Schema> }> {
  const pg = new PGlite();
  await pg.waitReady;
  const db = new Kysely<Schema>({
    dialect: new HardenedPGliteDialect(pg, {
      acquireTimeoutMs: ACQUIRE_TIMEOUT_MS,
      onDiagnostic: () => undefined,
    }),
  });
  await sql`create table t (id int primary key)`.execute(db);
  return { pg, db };
}

describe("the shared PGlite session is poisonable and unrecoverable", () => {
  it("fails the transaction when its COMMIT silently degraded to a ROLLBACK", async () => {
    const { pg, db } = await freshDb();

    let resolvedWith: unknown;
    let threw: unknown;
    try {
      resolvedWith = await db.transaction().execute(async (trx) => {
        await sql`insert into t (id) values (1)`.execute(trx);
        try {
          await sql`select 1 / 0`.execute(trx);
        } catch {
          /* swallowed, as an unrelated consumer of the session would */
        }
        return "JOB-SUCCEEDED";
      });
    } catch (error) {
      threw = error;
    }

    const rows = await sql<Row>`select id from t`.execute(db);
    expect(rows.rows).toEqual([]);
    expect(threw).toBeDefined();
    expect(resolvedWith).toBeUndefined();
    await pg.close();
  });

  it("fails the transaction when an outside statement aborted it", async () => {
    const { pg, db } = await freshDb();

    const tx = db.transaction().execute(async (trx) => {
      await sql`insert into t (id) values (2)`.execute(trx);
      await new Promise((resolve) => setTimeout(resolve, 50));
      return "JOB-SUCCEEDED";
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    await pg.query("select 1 / 0").catch(() => undefined);

    const outcome = await tx.then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    const rows = await sql<Row>`select id from t`.execute(db);

    expect(rows.rows).toEqual([]);
    expect(outcome.ok).toBe(false);
    await pg.close();
  });

  it("recovers a session left in an aborted transaction", async () => {
    const { pg, db } = await freshDb();

    await pg.query("BEGIN");
    await pg.query("select 1 / 0").catch(() => undefined);
    expect(pg.isInTransaction()).toBe(true);

    const first = await sql<{ x: number }>`select 1 as x`
      .execute(db)
      .then((r) => r.rows)
      .catch((error: Error) => ({ err: error.message }));
    expect(first).toEqual({
      err: expect.stringContaining("current transaction is aborted") as string,
    });

    const read = await sql<{ x: number }>`select 1 as x`
      .execute(db)
      .then((r) => r.rows)
      .catch((error: Error) => ({ err: error.message }));
    expect(read).toEqual([{ x: 1 }]);

    const write = await db
      .transaction()
      .execute(async (trx) => {
        await sql`insert into t (id) values (9)`.execute(trx);
        return "ok";
      })
      .catch((error: Error) => ({ err: error.message }));
    expect(write).toBe("ok");
    await pg.close();
  });

  it("does not release a connection whose rollback failed", async () => {
    const pg = new PGlite();
    await pg.waitReady;
    await pg.query("create table t (id int primary key)");

    const portalStuck = { value: false };
    const client = new Proxy(pg, {
      get(target, prop, receiver) {
        if (prop === "query") {
          return async (text: string, params?: unknown[]) => {
            if (portalStuck.value && /^\s*rollback/i.test(text)) {
              throw new Error('cannot drop active portal ""');
            }
            return target.query(text, params);
          };
        }
        const value = Reflect.get(target, prop, receiver) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const db = new Kysely<Schema>({
      dialect: new HardenedPGliteDialect(client as unknown as PGlite, {
        acquireTimeoutMs: ACQUIRE_TIMEOUT_MS,
        onDiagnostic: () => undefined,
      }),
    });

    portalStuck.value = true;
    const outcome = await db
      .transaction()
      .execute(async (trx) => {
        await sql`insert into t (id) values (1)`.execute(trx);
        throw new Error("JOB-FAILED");
      })
      .then(
        () => ({ message: "resolved" }),
        (error: Error) => ({ message: error.message }),
      );

    expect(outcome.message).toContain("JOB-FAILED");
    expect(pg.isInTransaction()).toBe(false);
    await pg.close();
  });

  it("does not deadlock when a recovery path queries the base handle", async () => {
    const { pg, db } = await freshDb();

    const raced = await Promise.race([
      db
        .transaction()
        .execute(async (trx) => {
          await sql`insert into t (id) values (1)`.execute(trx);
          await sql`select 1`.execute(db);
          return "ok";
        })
        .then(
          () => "resolved" as const,
          () => "threw" as const,
        ),
      new Promise<"hung">((resolve) => setTimeout(() => resolve("hung"), 1000)),
    ]);

    expect(raced).not.toBe("hung");
    expect(pg.isInTransaction()).toBe(false);
  });
});
