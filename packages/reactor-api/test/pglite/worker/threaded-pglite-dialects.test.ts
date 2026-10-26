import {
  HardenedPGliteDialect,
  PGliteAbortedTransactionError,
} from "@powerhousedao/reactor";
import knex, { type Knex } from "knex";
import ClientPgLite from "knex-pglite";
import { type Generated, Kysely, sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ThreadedPGlite } from "../../../src/pglite/worker/threaded-pglite.js";
import { BOOT_TIMEOUT_MS, startThreadedPGlite } from "./helpers.js";

type Row = { v: string };

type KnexPgliteConnection = {
  pglite: ThreadedPGlite;
  connectionString?: undefined;
};

describe("knex-pglite over ThreadedPGlite", () => {
  let pg: ThreadedPGlite;
  let db: Knex;

  beforeAll(async () => {
    pg = startThreadedPGlite();
    // knex's connection types know no `pglite` key; the optional
    // connectionString gives the object the overlap they require, as in db.ts.
    const connection: KnexPgliteConnection = { pglite: pg };
    db = knex({ client: ClientPgLite as typeof knex.Client, connection });
    await db.schema.createTable("items", (table) => {
      table.increments("id");
      table.string("v").notNullable();
      table.timestamp("at").notNullable().defaultTo(db.fn.now());
    });
  }, BOOT_TIMEOUT_MS);

  afterAll(async () => {
    await db.destroy();
  });

  async function values(): Promise<string[]> {
    const rows = await db<Row>("items").select("v").orderBy("id");
    return rows.map((row) => row.v);
  }

  it("commits a transaction", async () => {
    await db.transaction(async (trx) => {
      await trx("items").insert({ v: "committed" });
      expect(pg.isInTransaction()).toBe(true);
    });
    expect(pg.isInTransaction()).toBe(false);
    expect(await values()).toEqual(["committed"]);
  });

  it("rolls back a transaction that throws", async () => {
    await expect(
      db.transaction(async (trx) => {
        await trx("items").insert({ v: "rolled-back" });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(pg.isInTransaction()).toBe(false);
    expect(await values()).toEqual(["committed"]);
  });

  it("rolls back to a savepoint and commits the rest", async () => {
    await db.transaction(async (trx) => {
      await trx("items").insert({ v: "outer" });
      await expect(
        trx.transaction(async (inner) => {
          await inner("items").insert({ v: "inner" });
          throw new Error("inner fails");
        }),
      ).rejects.toThrow("inner fails");
      await trx.transaction(async (inner) => {
        await inner("items").insert({ v: "inner-kept" });
      });
      await trx("items").insert({ v: "after" });
    });
    expect(await values()).toEqual([
      "committed",
      "outer",
      "inner-kept",
      "after",
    ]);
  });

  it("surfaces Postgres error codes through knex", async () => {
    await expect(db.raw("select 1/0")).rejects.toMatchObject({
      code: "22012",
    });
  });

  it("reads timestamps as Dates", async () => {
    const [row] = await db("items").select("at").limit(1);
    expect((row as { at: unknown }).at).toBeInstanceOf(Date);
  });

  it("closes the stand-in on destroy", async () => {
    await db.destroy();
    expect(pg.closed).toBe(true);
  });
});

type KyselyDb = {
  entries: { id: Generated<number>; v: string };
};

describe("HardenedPGliteDialect over ThreadedPGlite", () => {
  let pg: ThreadedPGlite;
  let db: Kysely<KyselyDb>;
  const diagnostics: string[] = [];

  beforeAll(async () => {
    pg = startThreadedPGlite();
    db = new Kysely<KyselyDb>({
      dialect: new HardenedPGliteDialect(pg, {
        onDiagnostic: (message) => diagnostics.push(message),
      }),
    });
    await db.schema
      .createTable("entries")
      .addColumn("id", "serial", (col) => col.primaryKey())
      .addColumn("v", "text", (col) => col.notNull())
      .execute();
  }, BOOT_TIMEOUT_MS);

  afterAll(async () => {
    await db.destroy();
    await pg.close();
  });

  async function values(): Promise<string[]> {
    const rows = await db
      .selectFrom("entries")
      .select("v")
      .orderBy("id")
      .execute();
    return rows.map((row) => row.v);
  }

  it("commits through the commit guard", async () => {
    await db.transaction().execute(async (trx) => {
      await trx.insertInto("entries").values({ v: "a" }).execute();
      expect(pg.isInTransaction()).toBe(true);
    });
    expect(pg.isInTransaction()).toBe(false);
    expect(await values()).toEqual(["a"]);
  });

  it("rolls back a transaction that throws", async () => {
    await expect(
      db.transaction().execute(async (trx) => {
        await trx.insertInto("entries").values({ v: "gone" }).execute();
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(pg.isInTransaction()).toBe(false);
    expect(await values()).toEqual(["a"]);
  });

  it("carries 25P02 from a statement in an aborted transaction", async () => {
    await expect(
      db.transaction().execute(async (trx) => {
        await trx.insertInto("entries").values({ v: "aborted" }).execute();
        await sql`select 1/0`.execute(trx).catch(() => undefined);
        await sql`select 1`.execute(trx);
      }),
    ).rejects.toMatchObject({ code: "25P02" });
    expect(pg.isInTransaction()).toBe(false);
    expect(await values()).toEqual(["a"]);
  });

  it("refuses to commit an aborted transaction", async () => {
    const error = await db
      .transaction()
      .execute(async (trx) => {
        await trx.insertInto("entries").values({ v: "swallowed" }).execute();
        await sql`select 1/0`.execute(trx).catch(() => undefined);
      })
      .then(
        () => null,
        (err: unknown) => err,
      );
    expect(error).toBeInstanceOf(PGliteAbortedTransactionError);
    expect((error as Error).cause).toMatchObject({ code: "25P02" });
    expect(pg.isInTransaction()).toBe(false);
    expect(await values()).toEqual(["a"]);
  });

  it("recovers a session another consumer left in an aborted transaction", async () => {
    await pg.query("begin");
    await expect(pg.query("select 1/0")).rejects.toMatchObject({
      code: "22012",
    });
    expect(pg.isInTransaction()).toBe(true);

    await expect(values()).rejects.toMatchObject({ code: "25P02" });
    expect(pg.isInTransaction()).toBe(false);
    expect(await values()).toEqual(["a"]);
    expect(diagnostics).not.toContain(
      "the PGlite session could not be reset and is being marked unrecoverable",
    );
  });
});
